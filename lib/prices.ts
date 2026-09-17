import { STOCKS, USDG, WETH, lower } from './chain';

/**
 * Prices come from DexScreener's Robinhood Chain index, which already knows
 * every pool a token trades in. We take the deepest pool where the token is
 * the base, and value it in USD — USDG is a dollar, so USD and USDG coincide.
 */
export type Quote = {
  address: string; symbol: string; name: string; usd: number;
  liquidity: number; change24h: number; volume24h: number; pairUrl: string; image?: string;
};

type Pair = {
  chainId: string; url: string; priceUsd?: string; priceNative?: string;
  baseToken: { address: string; symbol: string; name: string };
  quoteToken: { address: string; symbol: string };
  liquidity?: { usd?: number }; priceChange?: { h24?: number }; volume?: { h24?: number };
  info?: { imageUrl?: string };
};

const cache = new Map<string, { at: number; q: Quote | null }>();
const TTL = 45_000;

export async function getQuotes(addresses: string[]): Promise<Record<string, Quote>> {
  const want = Array.from(new Set(addresses.map(lower)));
  const out: Record<string, Quote> = {};
  const miss: string[] = [];
  const now = Date.now();
  for (const a of want) {
    if (a === lower(USDG)) { out[a] = { address: a, symbol: 'USDG', name: 'Global Dollar', usd: 1, liquidity: 0, change24h: 0, volume24h: 0, pairUrl: '' }; continue; }
    const c = cache.get(a);
    if (c && now - c.at < TTL) { if (c.q) out[a] = c.q; } else miss.push(a);
  }
  for (let i = 0; i < miss.length; i += 30) {
    const chunk = miss.slice(i, i + 30);
    let pairs: Pair[] = [];
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${chunk.join(',')}`, {
        headers: { 'User-Agent': 'musetrade/0.1' }, next: { revalidate: 30 },
      });
      if (r.ok) pairs = (await r.json()) as Pair[];
    } catch { /* a missing quote is a zero, never a crash */ }
    const best = new Map<string, Pair>();
    for (const p of pairs) {
      if (p.chainId !== 'robinhood' || !p.priceUsd) continue;
      const a = lower(p.baseToken.address);
      if (!chunk.includes(a)) continue;
      const liq = p.liquidity?.usd ?? 0;
      const cur = best.get(a);
      if (!cur || liq > (cur.liquidity?.usd ?? 0)) best.set(a, p);
    }
    for (const a of chunk) {
      const p = best.get(a);
      const q: Quote | null = p ? {
        address: a, symbol: p.baseToken.symbol, name: p.baseToken.name.replace(' • Robinhood Token', ''),
        usd: Number(p.priceUsd), liquidity: p.liquidity?.usd ?? 0, change24h: p.priceChange?.h24 ?? 0,
        volume24h: p.volume?.h24 ?? 0, pairUrl: p.url, image: p.info?.imageUrl,
      } : null;
      cache.set(a, { at: now, q });
      if (q) out[a] = q;
    }
  }
  return out;
}

/** The hero tape: tokenised stocks plus ETH, in a fixed order. */
export async function getTape(): Promise<Quote[]> {
  const list = [...STOCKS.map((s) => s.address), WETH];
  const q = await getQuotes(list);
  return list.map((a) => q[lower(a)]).filter(Boolean).map((x) => x.address === lower(WETH) ? { ...x, symbol: 'ETH', name: 'Ether' } : x);
}
