import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * One small document store, two backends. Locally it is JSON files under
 * .data/. On Vercel it is Blob: every document is a public JSON object at a
 * fixed path, overwritten on write and read with the CDN told not to cache.
 * Writes are rare (a registration, a snapshot every few minutes), reads are
 * served from the in-process cache below, so this is plenty.
 */
export type Agent = {
  id: string; name: string; address: string; bio: string; avatarUrl?: string;
  museId?: string; human?: string; registeredAt: number; registeredBlock: number;
};
export type Holding = { token: string; symbol: string; amount: number; usd: number; price: number };
export type Snapshot = { t: number; block: number; equity: number; deposits: number; withdrawals: number; trades: number };
export type Trade = {
  hash: string; block: number; t: number;
  sold: { token: string; symbol: string; amount: number }[];
  bought: { token: string; symbol: string; amount: number }[];
  kind: 'swap' | 'deposit' | 'withdrawal';
};
export type Activity = { cursor: number; trades: Trade[]; tokens: string[]; scannedAt: number };
export type TokenMeta = Record<string, { symbol: string; decimals: number; name: string }>;
export type Latest = {
  at: number; block: number; equity: number; deposits: number; withdrawals: number;
  holdings: Holding[]; tradeCount: number; lastTradeAt?: number;
};

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const ROOT = path.join(process.cwd(), '.data');
const mem = new Map<string, { at: number; v: unknown }>();
const MEM_TTL = 15_000;

async function readRaw<T>(key: string): Promise<T | null> {
  if (useBlob) {
    const { head } = await import('@vercel/blob');
    try {
      const h = await head(key);
      const r = await fetch(`${h.url}?v=${h.uploadedAt.getTime()}`, { cache: 'no-store' });
      if (!r.ok) return null;
      return (await r.json()) as T;
    } catch { return null; }
  }
  try { return JSON.parse(await fs.readFile(path.join(ROOT, key), 'utf8')) as T; } catch { return null; }
}
async function writeRaw(key: string, value: unknown) {
  const body = JSON.stringify(value);
  if (useBlob) {
    const { put } = await import('@vercel/blob');
    await put(key, body, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });
  } else {
    const p = path.join(ROOT, key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  }
  mem.set(key, { at: Date.now(), v: value });
}
async function read<T>(key: string, fallback: T): Promise<T> {
  const c = mem.get(key);
  if (c && Date.now() - c.at < MEM_TTL) return c.v as T;
  const v = (await readRaw<T>(key)) ?? fallback;
  mem.set(key, { at: Date.now(), v });
  return v;
}

export const store = {
  agents: () => read<Agent[]>('agents.json', []),
  saveAgents: (a: Agent[]) => writeRaw('agents.json', a),
  activity: (addr: string) => read<Activity | null>(`activity/${addr.toLowerCase()}.json`, null),
  saveActivity: (addr: string, a: Activity) => writeRaw(`activity/${addr.toLowerCase()}.json`, a),
  latest: (addr: string) => read<Latest | null>(`latest/${addr.toLowerCase()}.json`, null),
  saveLatest: (addr: string, l: Latest) => writeRaw(`latest/${addr.toLowerCase()}.json`, l),
  snapshots: (addr: string) => read<Snapshot[]>(`snapshots/${addr.toLowerCase()}.json`, []),
  saveSnapshots: (addr: string, s: Snapshot[]) => writeRaw(`snapshots/${addr.toLowerCase()}.json`, s),
  tokens: () => read<TokenMeta>('tokens.json', {}),
  saveTokens: (t: TokenMeta) => writeRaw('tokens.json', t),
  forget: (key?: string) => (key ? mem.delete(key) : mem.clear()),
};
