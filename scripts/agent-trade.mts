/**
 * Reference muse: one exact-input swap on Uniswap v4 through the Universal
 * Router, from the muse's own wallet. Finds the pool key by matching the
 * deepest DexScreener pool id against candidate (fee, tickSpacing) pairs, so
 * nothing about the pool has to be typed by hand.
 *
 *   npm run agent:trade -- --key 0x… --sell USDG --buy META --amount 2 [--slippage 1]
 */
import { createWalletClient, encodeAbiParameters, encodeFunctionData, encodePacked, formatUnits, http, keccak256, maxUint160, maxUint256, parseAbi, parseUnits, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { client, erc20Abi, PERMIT2, robinhood, STOCKS, transport, UNIVERSAL_ROUTER, USDG, WETH, lower } from '../lib/chain';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const key = (arg('key', process.env.MUSE_KEY) ?? '') as Hex;
if (!key) throw new Error('--key or MUSE_KEY');
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ account, chain: robinhood, transport: transport() }); // same fallback RPC set as the reads

const NATIVE = '0x0000000000000000000000000000000000000000' as Address;
const KNOWN: Record<string, Address> = { USDG, WETH, ETH: NATIVE, ...Object.fromEntries(STOCKS.map((s: { symbol: string; address: Address }) => [s.symbol, s.address])) };
const tok = (s: string): Address => (KNOWN[s.toUpperCase()] ?? (s as Address));
const sellArg = arg('sell', 'USDG')!;
const sell = tok(sellArg), buy = tok(arg('buy', 'META')!);
const sellingEth = sellArg.toUpperCase() === 'ETH';
const slippage = Number(arg('slippage', '1'));

const isNative = (t: Address) => lower(t) === NATIVE;
const meta = async (t: Address): Promise<{ dec: number; sym: string }> => isNative(t) ? { dec: 18, sym: 'ETH' } : ({
  dec: await client.readContract({ address: t, abi: erc20Abi, functionName: 'decimals' }),
  sym: await client.readContract({ address: t, abi: erc20Abi, functionName: 'symbol' }),
});
const balance = async (t: Address): Promise<bigint> => isNative(t) ? client.getBalance({ address: account.address }) : client.readContract({ address: t, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
const [{ dec: decSell, sym: symSell }, { dec: decBuy, sym: symBuy }] = await Promise.all([meta(sell), meta(buy)]);
const amountIn = parseUnits(arg('amount', '1')!, decSell);

// 0. what the wallet actually has, before spending gas on approvals
const [ethBal, sellBal] = await Promise.all([client.getBalance({ address: account.address }), balance(sell)]);
console.log(`${account.address}: ${formatUnits(ethBal, 18)} ETH, ${formatUnits(sellBal, decSell)} ${symSell}`);
if (sellingEth) {
  if (ethBal < amountIn + parseUnits('0.0004', 18)) throw new Error(`not enough ETH: selling ${formatUnits(amountIn, 18)} plus gas`);
} else if (sellBal < amountIn) {
  throw new Error(`not enough ${symSell}: wallet holds ${formatUnits(sellBal, decSell)}, asked to sell ${formatUnits(amountIn, decSell)}. fund it first (USDG ${USDG}).`);
}
if (ethBal < parseUnits('0.0002', 18)) throw new Error('no ETH for gas');

type Pair = { chainId: string; dexId: string; pairAddress: string; labels?: string[]; priceUsd: string; liquidity?: { usd?: number }; baseToken: { address: string }; quoteToken: { address: string }; priceNative: string };
const permit2Abi = parseAbi(['function approve(address token, address spender, uint160 amount, uint48 expiration)', 'function allowance(address, address, address) view returns (uint160, uint48, uint48)']);
const routerAbi = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']);
const zero = '0x0000000000000000000000000000000000000000' as Address;
const poolKeyTuple = { type: 'tuple', components: [{ name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }] } as const;

const symOf = (t: Address) => Object.entries(KNOWN).find(([, v]) => lower(v) === lower(t))?.[0] ?? 'USDG';
/** The deepest Uniswap pool (v3 or v4) between two currencies, per DexScreener. Native ETH is address(0) in v4. */
async function bestPool(a: Address, b: Address): Promise<Pair[]> {
  // Ask for both tokens: DexScreener caps the list per token, and USDG is a quote in thousands of pools.
  const H = { headers: { 'User-Agent': 'musestock-agent/0.1' } };
  const urls = [a, b].filter((t) => !isNative(t)).map((t) => `https://api.dexscreener.com/tokens/v1/robinhood/${t}`);
  if (isNative(a) || isNative(b)) urls.push(`https://api.dexscreener.com/latest/dex/search?q=ETH%20${isNative(a) ? symOf(b) : symOf(a)}`);
  const pairs = (await Promise.all(urls.map(async (u) => { const j = await (await fetch(u, H)).json(); return (Array.isArray(j) ? j : j.pairs ?? []) as Pair[]; }))).flat();
  const want = [lower(a), lower(b)].sort().join();
  return pairs
    .filter((p) => p.chainId === 'robinhood' && p.dexId === 'uniswap' && (p.labels?.includes('v4') || p.labels?.includes('v3')))
    .filter((p) => [lower(p.baseToken.address), lower(p.quoteToken.address)].sort().join() === want)
    .sort((x, y) => (y.liquidity?.usd ?? 0) - (x.liquidity?.usd ?? 0));
}
const FEES = [100, 200, 250, 300, 400, 500, 1000, 2500, 3000, 5000, 10000, 20000, 30000, 8388608];
const SPACINGS = [1, 2, 5, 8, 10, 15, 20, 25, 30, 40, 50, 60, 100, 120, 150, 200, 250, 300, 500, 1000];
/** Recover a hookless v4 pool key from its id, or null if the pool has a hook / odd key. */
function v4Key(c0: Address, c1: Address, poolId: string): { fee: number; tickSpacing: number } | null {
  const keyOf = (fee: number, ts: number) => keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }], [c0, c1, fee, ts, zero]));
  for (const fee of FEES) for (const ts of SPACINGS) if (keyOf(fee, ts) === lower(poolId)) return { fee, tickSpacing: ts };
  return null;
}

/** Token → Permit2 (once) and Permit2 → Universal Router (once). */
async function ensureApprovals(token: Address, amount: bigint) {
  const allowance = await client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account.address, PERMIT2] });
  if (allowance < amount) {
    const h = await wallet.writeContract({ address: token, abi: erc20Abi, functionName: 'approve', args: [PERMIT2, maxUint256] });
    await client.waitForTransactionReceipt({ hash: h }); console.log('approved permit2', h);
  }
  const [p2amt, p2exp] = await client.readContract({ address: PERMIT2, abi: permit2Abi, functionName: 'allowance', args: [account.address, token, UNIVERSAL_ROUTER] });
  if (p2amt < amount || p2exp < Math.floor(Date.now() / 1000) + 3600) {
    const h = await wallet.writeContract({ address: PERMIT2, abi: permit2Abi, functionName: 'approve', args: [token, UNIVERSAL_ROUTER, maxUint160, 2 ** 48 - 1] });
    await client.waitForTransactionReceipt({ hash: h }); console.log('approved router on permit2', h);
  }
}

/** One exact-input swap through the Universal Router; returns what arrived. */
async function swapOnce(from: Address, to: Address, amount: bigint): Promise<bigint> {
  const [{ dec: dIn, sym: sIn }, { dec: dOut, sym: sOut }] = await Promise.all([meta(from), meta(to)]);
  // Deepest pool we can actually address. v4 first (hookless keys we can rebuild);
  // v3 only when no v4 pool exists — the forked router's v3 leg is unverified here.
  const [c0, c1] = [lower(from), lower(to)].sort() as [Address, Address];
  let pool: Pair | undefined; let key: { fee: number; tickSpacing: number } | null = null;
  const candidates = await bestPool(from, to);
  for (const p of candidates) { if (!p.labels?.includes('v4')) continue; key = v4Key(c0, c1, p.pairAddress); if (key) { pool = p; break; } }
  if (!pool && !isNative(from) && !isNative(to)) pool = candidates.find((p) => p.labels?.includes('v3'));
  if (!pool) throw new Error(`no addressable uniswap pool for ${sIn}/${sOut}`);
  const sellingBase = lower(from) === lower(pool.baseToken.address);
  const expectedOut = sellingBase ? Number(formatUnits(amount, dIn)) * Number(pool.priceNative) : Number(formatUnits(amount, dIn)) / Number(pool.priceNative);
  const minOut = parseUnits((expectedOut * (1 - slippage / 100)).toFixed(dOut), dOut);
  if (!isNative(from)) await ensureApprovals(from, amount);
  else if (!pool.labels?.includes('v4')) throw new Error('native ETH only trades on v4 pools');
  let commands: Hex; let input: Hex;
  if (pool.labels?.includes('v4')) {
    if (!key) throw new Error('unreachable: v4 pool without key');
    // Robinhood's fork: ExactInputSingleParams has minHopPriceX36 (uint256) between amountOutMinimum and hookData.
    const swapParams = encodeAbiParameters(
      [{ type: 'tuple', components: [{ name: 'poolKey', ...poolKeyTuple }, { name: 'zeroForOne', type: 'bool' }, { name: 'amountIn', type: 'uint128' }, { name: 'amountOutMinimum', type: 'uint128' }, { name: 'minHopPriceX36', type: 'uint256' }, { name: 'hookData', type: 'bytes' }] }],
      [{ poolKey: { currency0: c0, currency1: c1, fee: key.fee, tickSpacing: key.tickSpacing, hooks: zero }, zeroForOne: lower(from) === c0, amountIn: amount, amountOutMinimum: minOut, minHopPriceX36: 0n, hookData: '0x' }]);
    const settle = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }], [from, amount, true]);
    const take = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [to, minOut]);
    const actions = encodePacked(['uint8', 'uint8', 'uint8'], [0x06, 0x0b, 0x0f]); // SWAP_EXACT_IN_SINGLE, SETTLE (payer = user), TAKE_ALL
    commands = '0x10'; input = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, [swapParams, settle, take]]);
    console.log(`v4: ${formatUnits(amount, dIn)} ${sIn} → ≥ ${formatUnits(minOut, dOut)} ${sOut} (fee ${key.fee / 1e4}%)`);
  } else {
    const fee = await client.readContract({ address: pool.pairAddress as Address, abi: parseAbi(['function fee() view returns (uint24)']), functionName: 'fee' });
    const path = encodePacked(['address', 'uint24', 'address'], [from, Number(fee), to]);
    commands = '0x00'; // V3_SWAP_EXACT_IN, paid by the user through Permit2
    // Robinhood's fork appends uint256[] minHopPriceX36 to every swap input; omit it and it reverts.
    input = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes' }, { type: 'bool' }, { type: 'uint256[]' }], [account.address, amount, minOut, path, true, []]);
    console.log(`v3: ${formatUnits(amount, dIn)} ${sIn} → ≥ ${formatUnits(minOut, dOut)} ${sOut} (fee ${Number(fee) / 1e4}%)`);
  }
  const before: bigint = await balance(to);
  const data = encodeFunctionData({ abi: routerAbi, functionName: 'execute', args: [commands, [input], BigInt(Math.floor(Date.now() / 1000) + 600)] });
  // Native input rides along as msg.value; the router settles it into the PoolManager.
  const hash = await wallet.sendTransaction({ to: UNIVERSAL_ROUTER, data, chain: robinhood, value: isNative(from) ? amount : 0n });
  const rc = await client.waitForTransactionReceipt({ hash });
  const after: bigint = await balance(to);
  const got: bigint = after - before;
  console.log(rc.status, `https://robinhoodchain.blockscout.com/tx/${hash}`, `+${formatUnits(got, dOut)} ${sOut}`);
  if (rc.status !== 'success') throw new Error('swap reverted');
  return got;
}

// Route: direct if a pool exists, otherwise through USDG, which every stock and most memes pair against.
if ((await bestPool(sell, buy)).length) await swapOnce(sell, buy, amountIn);
else if (lower(sell) !== lower(USDG) && lower(buy) !== lower(USDG)) { const mid = await swapOnce(sell, USDG, amountIn); await swapOnce(USDG, buy, mid); }
else throw new Error(`no route for ${symSell} → ${symBuy}`);
