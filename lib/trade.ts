import { createWalletClient, encodeAbiParameters, encodeFunctionData, encodePacked, formatUnits, keccak256, maxUint160, maxUint256, parseAbi, parseUnits, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { client, erc20Abi, PERMIT2, robinhood, STOCKS, transport, UNIVERSAL_ROUTER, USDG, WETH, lower } from './chain';

/**
 * The swap engine every muse script shares. One exact-input swap through
 * Robinhood Chain's forked Universal Router: v4 pools first (hookless keys we
 * can rebuild from the pool id), v3 when a stock only has a v3 pool, routed
 * through USDG when there is no direct pair. Native ETH is address(0).
 *
 * The fork's quirks, learned the hard way: ExactInputSingleParams carries a
 * uint256 minHopPriceX36 after amountOutMinimum, and every v3 input ends with
 * a uint256[] of the same name. Omit either and the router reverts silently.
 */
export const NATIVE = '0x0000000000000000000000000000000000000000' as Address;
export const KNOWN: Record<string, Address> = { USDG, WETH, ETH: NATIVE, ...Object.fromEntries(STOCKS.map((s) => [s.symbol, s.address])) };
export const tok = (s: string): Address => (KNOWN[s.toUpperCase()] ?? (s as Address));
export const isNative = (t: Address) => lower(t) === NATIVE;
const symOf = (t: Address) => Object.entries(KNOWN).find(([, v]) => lower(v) === lower(t))?.[0] ?? 'USDG';

type Pair = { chainId: string; dexId: string; pairAddress: string; labels?: string[]; priceUsd: string; liquidity?: { usd?: number }; baseToken: { address: string }; quoteToken: { address: string }; priceNative: string };
const permit2Abi = parseAbi(['function approve(address token, address spender, uint160 amount, uint48 expiration)', 'function allowance(address, address, address) view returns (uint160, uint48, uint48)']);
const routerAbi = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']);
const poolKeyTuple = { type: 'tuple', components: [{ name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }] } as const;
const FEES = [100, 200, 250, 300, 400, 500, 1000, 2500, 3000, 5000, 10000, 20000, 30000, 8388608];
const SPACINGS = [1, 2, 5, 8, 10, 15, 20, 25, 30, 40, 50, 60, 100, 120, 150, 200, 250, 300, 500, 1000];

export async function meta(t: Address): Promise<{ dec: number; sym: string }> {
  if (isNative(t)) return { dec: 18, sym: 'ETH' };
  const [dec, sym] = await Promise.all([client.readContract({ address: t, abi: erc20Abi, functionName: 'decimals' }), client.readContract({ address: t, abi: erc20Abi, functionName: 'symbol' })]);
  return { dec, sym };
}
export async function balanceOf(owner: Address, t: Address): Promise<bigint> {
  return isNative(t) ? client.getBalance({ address: owner }) : client.readContract({ address: t, abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
}

/** Deepest Uniswap pools between two currencies, per DexScreener, best first. */
export async function pools(a: Address, b: Address): Promise<Pair[]> {
  const H = { headers: { 'User-Agent': 'musestock-agent/0.1' } };
  const urls = [a, b].filter((t) => !isNative(t)).map((t) => `https://api.dexscreener.com/tokens/v1/robinhood/${t}`);
  if (isNative(a) || isNative(b)) urls.push(`https://api.dexscreener.com/latest/dex/search?q=ETH%20${isNative(a) ? symOf(b) : symOf(a)}`);
  const all = (await Promise.all(urls.map(async (u) => { try { const j = await (await fetch(u, H)).json(); return (Array.isArray(j) ? j : j.pairs ?? []) as Pair[]; } catch { return []; } }))).flat();
  const want = [lower(a), lower(b)].sort().join();
  return all
    .filter((p) => p.chainId === 'robinhood' && p.dexId === 'uniswap' && (p.labels?.includes('v4') || p.labels?.includes('v3')))
    .filter((p) => [lower(p.baseToken.address), lower(p.quoteToken.address)].sort().join() === want)
    .sort((x, y) => (y.liquidity?.usd ?? 0) - (x.liquidity?.usd ?? 0));
}

function v4Key(c0: Address, c1: Address, poolId: string): { fee: number; tickSpacing: number } | null {
  const keyOf = (fee: number, ts: number) => keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }], [c0, c1, fee, ts, NATIVE]));
  for (const fee of FEES) for (const ts of SPACINGS) if (keyOf(fee, ts) === lower(poolId)) return { fee, tickSpacing: ts };
  return null;
}

export type SwapResult = { hash: Hex; got: bigint; gotHuman: number; sym: string };
export type Log = (line: string) => void;

export class Muse {
  readonly account; readonly wallet;
  constructor(key: Hex, readonly log: Log = console.log) {
    this.account = privateKeyToAccount(key);
    this.wallet = createWalletClient({ account: this.account, chain: robinhood, transport: transport() });
  }
  get address() { return this.account.address; }

  private async ensureApprovals(token: Address, amount: bigint) {
    const allowance = await client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [this.address, PERMIT2] });
    if (allowance < amount) {
      const h = await this.wallet.writeContract({ address: token, abi: erc20Abi, functionName: 'approve', args: [PERMIT2, maxUint256] });
      await client.waitForTransactionReceipt({ hash: h }); this.log(`approved permit2 ${h}`);
    }
    const [p2amt, p2exp] = await client.readContract({ address: PERMIT2, abi: permit2Abi, functionName: 'allowance', args: [this.address, token, UNIVERSAL_ROUTER] });
    if (p2amt < amount || p2exp < Math.floor(Date.now() / 1000) + 3600) {
      const h = await this.wallet.writeContract({ address: PERMIT2, abi: permit2Abi, functionName: 'approve', args: [token, UNIVERSAL_ROUTER, maxUint160, 2 ** 48 - 1] });
      await client.waitForTransactionReceipt({ hash: h }); this.log(`approved router on permit2 ${h}`);
    }
  }

  /** One exact-input hop. Returns what arrived. */
  async swapOnce(from: Address, to: Address, amount: bigint, slippagePct = 1): Promise<SwapResult> {
    const [{ dec: dIn, sym: sIn }, { dec: dOut, sym: sOut }] = await Promise.all([meta(from), meta(to)]);
    const [c0, c1] = [lower(from), lower(to)].sort() as [Address, Address];
    let pool: Pair | undefined; let key: { fee: number; tickSpacing: number } | null = null;
    const candidates = await pools(from, to);
    for (const p of candidates) { if (!p.labels?.includes('v4')) continue; key = v4Key(c0, c1, p.pairAddress); if (key) { pool = p; break; } }
    if (!pool && !isNative(from) && !isNative(to)) pool = candidates.find((p) => p.labels?.includes('v3'));
    if (!pool) throw new Error(`no addressable uniswap pool for ${sIn}/${sOut}`);
    const sellingBase = lower(from) === lower(pool.baseToken.address);
    const expectedOut = sellingBase ? Number(formatUnits(amount, dIn)) * Number(pool.priceNative) : Number(formatUnits(amount, dIn)) / Number(pool.priceNative);
    const minOut = parseUnits((expectedOut * (1 - slippagePct / 100)).toFixed(dOut), dOut);
    if (!isNative(from)) await this.ensureApprovals(from, amount);
    let commands: Hex; let input: Hex;
    if (pool.labels?.includes('v4')) {
      if (!key) throw new Error('unreachable: v4 pool without key');
      const swapParams = encodeAbiParameters(
        [{ type: 'tuple', components: [{ name: 'poolKey', ...poolKeyTuple }, { name: 'zeroForOne', type: 'bool' }, { name: 'amountIn', type: 'uint128' }, { name: 'amountOutMinimum', type: 'uint128' }, { name: 'minHopPriceX36', type: 'uint256' }, { name: 'hookData', type: 'bytes' }] }],
        [{ poolKey: { currency0: c0, currency1: c1, fee: key.fee, tickSpacing: key.tickSpacing, hooks: NATIVE }, zeroForOne: lower(from) === c0, amountIn: amount, amountOutMinimum: minOut, minHopPriceX36: 0n, hookData: '0x' }]);
      const settle = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }], [from, amount, true]);
      const take = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [to, minOut]);
      const actions = encodePacked(['uint8', 'uint8', 'uint8'], [0x06, 0x0b, 0x0f]);
      commands = '0x10'; input = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, [swapParams, settle, take]]);
      this.log(`v4: ${formatUnits(amount, dIn)} ${sIn} → ≥ ${formatUnits(minOut, dOut)} ${sOut} (fee ${key.fee / 1e4}%)`);
    } else {
      const fee = await client.readContract({ address: pool.pairAddress as Address, abi: parseAbi(['function fee() view returns (uint24)']), functionName: 'fee' });
      const path = encodePacked(['address', 'uint24', 'address'], [from, Number(fee), to]);
      commands = '0x00';
      input = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes' }, { type: 'bool' }, { type: 'uint256[]' }], [this.address, amount, minOut, path, true, []]);
      this.log(`v3: ${formatUnits(amount, dIn)} ${sIn} → ≥ ${formatUnits(minOut, dOut)} ${sOut} (fee ${Number(fee) / 1e4}%)`);
    }
    const before = await balanceOf(this.address, to);
    const data = encodeFunctionData({ abi: routerAbi, functionName: 'execute', args: [commands, [input], BigInt(Math.floor(Date.now() / 1000) + 600)] });
    const hash = await this.wallet.sendTransaction({ to: UNIVERSAL_ROUTER, data, chain: robinhood, value: isNative(from) ? amount : 0n });
    const rc = await client.waitForTransactionReceipt({ hash });
    const got = (await balanceOf(this.address, to)) - before;
    this.log(`${rc.status} https://robinhoodchain.blockscout.com/tx/${hash} +${formatUnits(got, dOut)} ${sOut}`);
    if (rc.status !== 'success') throw new Error('swap reverted');
    return { hash, got, gotHuman: Number(formatUnits(got, dOut)), sym: sOut };
  }

  /** Sell `amountHuman` of one currency for another, routing through USDG if needed. */
  async swap(sell: string, buy: string, amountHuman: number | string, slippagePct = 1): Promise<SwapResult> {
    const from = tok(sell), to = tok(buy);
    const { dec } = await meta(from);
    const amount = parseUnits(String(amountHuman), dec);
    const have = await balanceOf(this.address, from);
    if (have < amount) throw new Error(`not enough ${sell}: have ${formatUnits(have, dec)}, want ${amountHuman}`);
    if ((await client.getBalance({ address: this.address })) < parseUnits('0.0002', 18)) throw new Error('no ETH for gas');
    if ((await pools(from, to)).length) return this.swapOnce(from, to, amount, slippagePct);
    // No direct pool: two hops through whichever hub (USDG, then WETH) has a pool on both sides.
    for (const hub of [USDG, WETH]) {
      if (lower(hub) === lower(from) || lower(hub) === lower(to)) continue;
      const [a, b] = await Promise.all([pools(from, hub), pools(hub, to)]);
      if (a.length && b.length) { const mid = await this.swapOnce(from, hub, amount, slippagePct); return this.swapOnce(hub, to, mid.got, slippagePct); }
    }
    throw new Error(`no route for ${sell} → ${buy}`);
  }
}
