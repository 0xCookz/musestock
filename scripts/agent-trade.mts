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
import { client, erc20Abi, PERMIT2, robinhood, STOCKS, UNIVERSAL_ROUTER, USDG, WETH, lower } from '../lib/chain';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const key = (arg('key', process.env.MUSE_KEY) ?? '') as Hex;
if (!key) throw new Error('--key or MUSE_KEY');
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ account, chain: robinhood, transport: http('https://rpc.mainnet.chain.robinhood.com', { fetchOptions: { headers: { 'User-Agent': 'musetrade-agent/0.1' } } }) });

const KNOWN: Record<string, Address> = { USDG, WETH, ETH: WETH, ...Object.fromEntries(STOCKS.map((s: { symbol: string; address: Address }) => [s.symbol, s.address])) };
const tok = (s: string): Address => (KNOWN[s.toUpperCase()] ?? (s as Address));
const sell = tok(arg('sell', 'USDG')!), buy = tok(arg('buy', 'META')!);
const slippage = Number(arg('slippage', '1'));

const [decSell, decBuy, symSell, symBuy] = await Promise.all([
  client.readContract({ address: sell, abi: erc20Abi, functionName: 'decimals' }),
  client.readContract({ address: buy, abi: erc20Abi, functionName: 'decimals' }),
  client.readContract({ address: sell, abi: erc20Abi, functionName: 'symbol' }),
  client.readContract({ address: buy, abi: erc20Abi, functionName: 'symbol' }),
]);
const amountIn = parseUnits(arg('amount', '1')!, decSell);

// 1. the deepest v4 pool for this pair, from DexScreener, and its key
type Pair = { chainId: string; dexId: string; pairAddress: string; labels?: string[]; priceUsd: string; liquidity?: { usd?: number }; baseToken: { address: string }; quoteToken: { address: string }; priceNative: string };
const pairs = (await (await fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${buy}`, { headers: { 'User-Agent': 'musetrade-agent/0.1' } })).json()) as Pair[];
const pool = pairs
  .filter((p) => p.chainId === 'robinhood' && p.dexId === 'uniswap' && p.labels?.includes('v4') && p.pairAddress.length === 66)
  .filter((p) => [lower(p.baseToken.address), lower(p.quoteToken.address)].sort().join() === [lower(sell), lower(buy)].sort().join())
  .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
if (!pool) throw new Error(`no v4 pool for ${symSell}/${symBuy} on DexScreener`);
const [c0, c1] = [lower(sell), lower(buy)].sort() as [Address, Address];
const keyOf = (fee: number, tickSpacing: number, hooks: Address) => keccak256(encodeAbiParameters(
  [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }], [c0, c1, fee, tickSpacing, hooks]));
const zero = '0x0000000000000000000000000000000000000000' as Address;
let poolKey: { fee: number; tickSpacing: number; hooks: Address } | null = null;
outer: for (const fee of [100, 500, 3000, 10000, 8388608]) for (const ts of [1, 10, 60, 200, 100, 50, 20, 5]) {
  if (keyOf(fee, ts, zero) === lower(pool.pairAddress)) { poolKey = { fee, tickSpacing: ts, hooks: zero }; break outer; }
}
if (!poolKey) throw new Error(`pool ${pool.pairAddress} has a hook or an unusual key; trade it through the Uniswap app instead`);
const zeroForOne = lower(sell) === c0;

// 2. approvals: token → Permit2 (once), Permit2 → Universal Router (once)
const permit2Abi = parseAbi(['function approve(address token, address spender, uint160 amount, uint48 expiration)', 'function allowance(address, address, address) view returns (uint160, uint48, uint48)']);
const allowance = await client.readContract({ address: sell, abi: erc20Abi, functionName: 'allowance', args: [account.address, PERMIT2] });
if (allowance < amountIn) {
  const h = await wallet.writeContract({ address: sell, abi: erc20Abi, functionName: 'approve', args: [PERMIT2, maxUint256] });
  await client.waitForTransactionReceipt({ hash: h }); console.log('approved permit2', h);
}
const [p2amt, p2exp] = await client.readContract({ address: PERMIT2, abi: permit2Abi, functionName: 'allowance', args: [account.address, sell, UNIVERSAL_ROUTER] });
if (p2amt < amountIn || p2exp < Math.floor(Date.now() / 1000) + 3600) {
  const h = await wallet.writeContract({ address: PERMIT2, abi: permit2Abi, functionName: 'approve', args: [sell, UNIVERSAL_ROUTER, maxUint160, 2 ** 48 - 1] });
  await client.waitForTransactionReceipt({ hash: h }); console.log('approved router on permit2', h);
}

// 3. the swap: V4_SWAP = SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
// priceNative is quote per base: selling the base yields amount×price of quote, selling the quote yields amount÷price of base.
const sellingBase = lower(sell) === lower(pool.baseToken.address);
const expectedOut = sellingBase ? Number(formatUnits(amountIn, decSell)) * Number(pool.priceNative) : Number(formatUnits(amountIn, decSell)) / Number(pool.priceNative);
const minOut = parseUnits((expectedOut * (1 - slippage / 100)).toFixed(decBuy), decBuy);

const poolKeyTuple = { type: 'tuple', components: [{ name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }] } as const;
const swapParams = encodeAbiParameters(
  [{ type: 'tuple', components: [{ name: 'poolKey', ...poolKeyTuple }, { name: 'zeroForOne', type: 'bool' }, { name: 'amountIn', type: 'uint128' }, { name: 'amountOutMinimum', type: 'uint128' }, { name: 'hookData', type: 'bytes' }] }],
  [{ poolKey: { currency0: c0, currency1: c1, fee: poolKey.fee, tickSpacing: poolKey.tickSpacing, hooks: poolKey.hooks }, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: '0x' }]);
const settle = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [sell, amountIn]);
const take = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [buy, minOut]);
const actions = encodePacked(['uint8', 'uint8', 'uint8'], [0x06, 0x0c, 0x0f]);
const v4Input = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, [swapParams, settle, take]]);
const routerAbi = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']);
const data = encodeFunctionData({ abi: routerAbi, functionName: 'execute', args: ['0x10', [v4Input], BigInt(Math.floor(Date.now() / 1000) + 600)] });

console.log(`swap ${formatUnits(amountIn, decSell)} ${symSell} → ≥ ${formatUnits(minOut, decBuy)} ${symBuy}  (pool fee ${poolKey.fee / 1e4}%, spacing ${poolKey.tickSpacing})`);
const hash = await wallet.sendTransaction({ to: UNIVERSAL_ROUTER, data, chain: robinhood });
const rc = await client.waitForTransactionReceipt({ hash });
console.log(rc.status, `https://robinhoodchain.blockscout.com/tx/${hash}`);
