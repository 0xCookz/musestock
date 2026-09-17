import { isAddress, verifyMessage, type Address } from 'viem';
import { client, lower } from './chain';
import { refreshAgent } from './indexer';
import { store, type Agent, type Latest, type Snapshot } from './store';
import { SITE } from './site';

export type Row = Agent & {
  latest: Latest | null; pnl: number; ret: number; change24h: number; spark: number[]; rank: number;
};

const STALE = 5 * 60_000;

/** Registration is a signature: the wallet that will trade signs this text. */
export function registerMessage(name: string, address: string, timestamp: number) {
  return `${SITE.name.toLowerCase()}.lol wants to register the muse "${name}"\nwallet: ${address.toLowerCase()}\nchain: ${SITE.chain.id}\nat: ${timestamp}\n\nsigning costs nothing and moves nothing. it proves this wallet is yours.`;
}

const NAME = /^[a-z0-9][a-z0-9 _.-]{1,23}$/i;

export async function register(input: { name?: string; address?: string; bio?: string; avatarUrl?: string; museId?: string; human?: string; timestamp?: number; signature?: string }) {
  const name = String(input.name ?? '').trim();
  const address = String(input.address ?? '').trim();
  const timestamp = Number(input.timestamp);
  const signature = String(input.signature ?? '');
  if (!NAME.test(name)) throw new Error('name: 2–24 characters, letters, numbers, space, . _ -');
  if (!isAddress(address)) throw new Error('address: not an EVM address');
  if (!timestamp || Math.abs(Date.now() - timestamp) > 10 * 60_000) throw new Error('timestamp: must be within 10 minutes of now (ms since epoch)');
  const ok = await verifyMessage({ address: address as Address, message: registerMessage(name, address, timestamp), signature: signature as `0x${string}` }).catch(() => false);
  if (!ok) throw new Error('signature: does not match the message for this name, address and timestamp');
  const agents = await store.agents();
  if (agents.some((a) => lower(a.address) === lower(address))) throw new Error('this wallet is already a resident');
  if (agents.some((a) => a.name.toLowerCase() === name.toLowerCase())) throw new Error('that name is taken');
  const block = await client.getBlockNumber();
  const agent: Agent = {
    id: `muse_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`,
    name, address: lower(address), bio: String(input.bio ?? '').slice(0, 280),
    avatarUrl: /^https?:\/\//.test(String(input.avatarUrl ?? '')) ? String(input.avatarUrl).slice(0, 400) : undefined,
    museId: input.museId ? String(input.museId).slice(0, 40) : undefined,
    human: input.human ? String(input.human).replace(/^@/, '').slice(0, 40) : undefined,
    registeredAt: Date.now(), registeredBlock: Number(block),
  };
  await store.saveAgent(agent);
  return agent;
}

function change24h(snaps: Snapshot[], latest: Latest | null) {
  if (!latest) return 0;
  const cutoff = latest.at - 24 * 3600_000;
  const base = snaps.find((s) => s.t >= cutoff) ?? snaps[0];
  if (!base || base.equity <= 0) return 0;
  // Flows in the window are not performance.
  const flows = (latest.deposits - base.deposits) - (latest.withdrawals - base.withdrawals);
  return ((latest.equity - flows) / base.equity - 1) * 100;
}

async function row(a: Agent, refreshIfStale: boolean): Promise<Row> {
  let latest = await store.latest(a.address);
  if (refreshIfStale && (!latest || Date.now() - latest.at > STALE)) {
    try { latest = await refreshAgent(a); } catch (e) { console.error('row refresh', a.name, e); }
  }
  const snaps = await store.snapshots(a.address);
  const net = latest ? latest.deposits - latest.withdrawals : 0;
  const pnl = latest ? latest.equity - net : 0;
  const ret = net > 0 ? (pnl / net) * 100 : 0;
  const spark = snaps.slice(-48).map((s) => s.equity);
  return { ...a, latest, pnl, ret, change24h: change24h(snaps, latest), spark, rank: 0 };
}

export async function leaderboard(opts: { refresh?: boolean } = {}): Promise<Row[]> {
  const agents = await store.agents();
  const rows = await Promise.all(agents.map((a) => row(a, opts.refresh ?? true)));
  rows.sort((x, y) => (y.ret - x.ret) || (y.pnl - x.pnl) || (x.registeredAt - y.registeredAt));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

export async function muse(addressOrName: string, opts: { refresh?: boolean } = {}) {
  const agents = await store.agents();
  const key = addressOrName.toLowerCase();
  const a = agents.find((x) => lower(x.address) === key || x.name.toLowerCase() === key || x.id === addressOrName);
  if (!a) return null;
  const r = await row(a, opts.refresh ?? true);
  const [activity, snapshots] = await Promise.all([store.activity(a.address), store.snapshots(a.address)]);
  const all = await leaderboard({ refresh: false });
  r.rank = all.find((x) => x.address === a.address)?.rank ?? 0;
  return { row: r, trades: (activity?.trades ?? []).slice().reverse(), snapshots, residents: all.length };
}

export async function town() {
  const rows = await leaderboard({ refresh: true });
  const equity = rows.reduce((s, r) => s + (r.latest?.equity ?? 0), 0);
  const trades = rows.reduce((s, r) => s + (r.latest?.tradeCount ?? 0), 0);
  const lastTrade = Math.max(0, ...rows.map((r) => r.latest?.lastTradeAt ?? 0));
  return { rows, equity, trades, lastTrade, residents: rows.length };
}
