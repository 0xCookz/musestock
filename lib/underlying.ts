/** Reference price of the real stock, from Yahoo's public chart endpoint. USD, last regular-market print. */
export async function underlyingPrice(symbol: string): Promise<{ price: number; state: string } | null> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0 musestock/0.1' }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { chart: { result?: { meta: { regularMarketPrice: number; marketState?: string } }[] } };
    const m = j.chart.result?.[0]?.meta;
    return m ? { price: m.regularMarketPrice, state: m.marketState ?? 'unknown' } : null;
  } catch { return null; }
}
