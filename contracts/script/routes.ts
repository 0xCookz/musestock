/**
 * Finds, on the live chain, the pool each stock should be valued from, and
 * checks the contract's price maths against DexScreener before anything is
 * deployed. Exported for deploy.mts; run directly to print the table.
 */
import { encodeAbiParameters, keccak256, parseAbi, type Address, type Hex } from 'viem';
import { client, POOL_MANAGER, STOCKS, USDG, WETH, lower } from '../../lib/chain';
import { pools } from '../../lib/trade';

export type Route = { symbol: string; token: Address; kind: 1 | 2 | 3; poolId: Hex; pool: Address; hopPool: Address; dex: number; onchain: number };
const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const ZERO32 = `0x${'0'.repeat(64)}` as Hex;
const v3Abi = parseAbi(['function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)', 'function token0() view returns (address)']);

const convert = (sqrtP: bigint, inIs0: boolean, amount: bigint) => { const priceX128 = (sqrtP * sqrtP) / (1n << 64n); return inIs0 ? (amount * priceX128) / (1n << 128n) : (amount * (1n << 128n)) / priceX128; };
async function v4Quote(poolId: Hex, tokenIn: Address, tokenOut: Address, amount: bigint) {
  const slot = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [poolId, 6n]));
  const word = await client.readContract({ address: POOL_MANAGER, abi: parseAbi(['function extsload(bytes32) view returns (bytes32)']), functionName: 'extsload', args: [slot] });
  const sqrtP = BigInt(word) & ((1n << 160n) - 1n);
  return convert(sqrtP, BigInt(lower(tokenIn)) < BigInt(lower(tokenOut)), amount);
}
async function v3Quote(pool: Address, tokenIn: Address, amount: bigint) {
  const [[sqrtP], t0] = await Promise.all([client.readContract({ address: pool, abi: v3Abi, functionName: 'slot0' }), client.readContract({ address: pool, abi: v3Abi, functionName: 'token0' })]);
  return convert(sqrtP, lower(t0) === lower(tokenIn), amount);
}

export async function findRoutes(): Promise<Route[]> {
  const out: Route[] = [];
  const wethUsdg = (await pools(WETH, USDG)).find((p) => p.labels?.includes('v3'));
  for (const s of STOCKS) {
    const direct = await pools(s.address, USDG);
    const v4 = direct.find((p) => p.labels?.includes('v4') && p.pairAddress.length === 66);
    const v3 = direct.find((p) => p.labels?.includes('v3'));
    let r: Route | null = null;
    if (v4) r = { symbol: s.symbol, token: s.address, kind: 1, poolId: v4.pairAddress as Hex, pool: ZERO, hopPool: ZERO, dex: Number(v4.priceUsd), onchain: Number(await v4Quote(v4.pairAddress as Hex, s.address, USDG, 10n ** 18n)) / 1e6 };
    else if (v3) r = { symbol: s.symbol, token: s.address, kind: 2, poolId: ZERO32, pool: v3.pairAddress as Address, hopPool: ZERO, dex: Number(v3.priceUsd), onchain: Number(await v3Quote(v3.pairAddress as Address, s.address, 10n ** 18n)) / 1e6 };
    else {
      const viaWeth = (await pools(s.address, WETH)).find((p) => p.labels?.includes('v3'));
      if (viaWeth && wethUsdg) { const w = await v3Quote(viaWeth.pairAddress as Address, s.address, 10n ** 18n); r = { symbol: s.symbol, token: s.address, kind: 3, poolId: ZERO32, pool: viaWeth.pairAddress as Address, hopPool: wethUsdg.pairAddress as Address, dex: Number(viaWeth.priceUsd), onchain: Number(await v3Quote(wethUsdg.pairAddress as Address, WETH, w)) / 1e6 }; }
    }
    if (r) out.push(r); else console.log(`${s.symbol}: no pool found, skipped`);
  }
  return out;
}

if (process.argv[1]?.endsWith('routes.ts')) {
  for (const r of await findRoutes()) console.log(`${r.symbol.padEnd(6)} kind ${r.kind}  dexscreener $${r.dex.toFixed(2).padStart(9)}  contract maths $${r.onchain.toFixed(2).padStart(9)}  ${(Math.abs(r.onchain / r.dex - 1) * 100).toFixed(2)}% off`);
}
