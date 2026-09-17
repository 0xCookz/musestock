import { decodeEventLog, formatUnits, type Address } from 'viem';
import { client, erc20Abi, lower, LOG_ENDPOINTS, RPC_HEADERS, SECONDS_PER_BLOCK, TRANSFER_TOPIC, USDG, WETH } from './chain';
import { getQuotes } from './prices';
import { store, type Activity, type Agent, type Holding, type Latest, type Snapshot, type TokenMeta, type Trade } from './store';

/**
 * The indexer reads a muse the only way a receipt can be read: from the chain.
 * Every ERC-20 Transfer in or out of the wallet since registration is fetched,
 * grouped by transaction, and classified — a tx with an outflow and an inflow
 * is a swap; inflow alone is a deposit; outflow alone is a withdrawal. Holdings
 * are live balances of every token the wallet has ever received, plus ETH,
 * valued at the deepest pool's price. P&L is equity minus net deposits.
 */

const pad = (a: string) => (`0x000000000000000000000000${a.slice(2)}`.toLowerCase()) as `0x${string}`;

async function tokenMeta(addrs: string[]): Promise<TokenMeta> {
  const meta = await store.tokens();
  const miss = addrs.map(lower).filter((a) => !meta[a]);
  if (miss.length) {
    const res = await client.multicall({
      contracts: miss.flatMap((a) => [
        { address: a, abi: erc20Abi, functionName: 'symbol' } as const,
        { address: a, abi: erc20Abi, functionName: 'decimals' } as const,
        { address: a, abi: erc20Abi, functionName: 'name' } as const,
      ]),
      allowFailure: true,
    });
    miss.forEach((a, i) => {
      const [s, d, n] = [res[i * 3], res[i * 3 + 1], res[i * 3 + 2]];
      meta[a] = {
        symbol: (s.status === 'success' ? String(s.result) : a.slice(2, 8)).slice(0, 12),
        decimals: d.status === 'success' ? Number(d.result) : 18,
        name: (n.status === 'success' ? String(n.result) : 'unknown token').replace(' • Robinhood Token', ''),
      };
    });
    await store.saveTokens(meta);
  }
  return meta;
}

type RawLog = { address: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]]; data: `0x${string}`; blockNumber: `0x${string}`; transactionHash: `0x${string}` };
const MAX_CALLS = 40; // per refresh; anything beyond waits for the next one (the cursor keeps the place)

async function rpcLogs(url: string, from: bigint, to: bigint, topics: (string | null)[]): Promise<RawLog[]> {
  const r = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json', ...RPC_HEADERS }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics }] }),
  });
  const j = (await r.json()) as { result?: RawLog[]; error?: { message: string } };
  if (!r.ok || j.error) throw new Error(`${url}: ${j.error?.message ?? r.status}`);
  return j.result ?? [];
}

/**
 * Transfers in and out of a wallet over [from, to]. Tries each log endpoint in
 * turn, chunking to what it accepts; returns the logs and the last block fully
 * covered, so a partial scan simply resumes next time.
 */
async function fetchTransfers(addr: Address, from: bigint, to: bigint): Promise<{ logs: RawLog[]; upTo: bigint }> {
  let lastErr: unknown;
  for (const ep of LOG_ENDPOINTS) {
    const out: RawLog[] = [];
    let cursor = from; let calls = 0;
    try {
      while (cursor <= to && calls < MAX_CALLS) {
        const end = cursor + BigInt(ep.span) - 1n < to ? cursor + BigInt(ep.span) - 1n : to;
        const [ins, outs] = await Promise.all([
          rpcLogs(ep.url, cursor, end, [TRANSFER_TOPIC, null, pad(addr)]),
          rpcLogs(ep.url, cursor, end, [TRANSFER_TOPIC, pad(addr)]),
        ]);
        out.push(...ins, ...outs); calls += 2; cursor = end + 1n;
      }
      return { logs: out, upTo: cursor - 1n };
    } catch (e) { lastErr = e; if (out.length) return { logs: out, upTo: cursor - 1n }; }
  }
  throw lastErr ?? new Error('no log endpoint answered');
}

const blockTimes = new Map<bigint, number>();
async function blockTime(n: bigint, head: bigint, headTime: number) {
  const c = blockTimes.get(n); if (c) return c;
  // Recent blocks: estimate from the head, exact enough for "3m ago". Older
  // ones are fetched once and remembered for the life of the process.
  if (head - n < 6000n) { const t = headTime - Number(head - n) * SECONDS_PER_BLOCK * 1000; blockTimes.set(n, t); return t; }
  const b = await client.getBlock({ blockNumber: n });
  const t = Number(b.timestamp) * 1000; blockTimes.set(n, t); return t;
}

/** Bring one muse's activity file up to the chain head. */
export async function scanActivity(agent: Agent, head: bigint, headTime: number): Promise<Activity> {
  const addr = lower(agent.address);
  const prev = (await store.activity(addr)) ?? { cursor: agent.registeredBlock - 1, trades: [], tokens: [], scannedAt: 0 };
  const from = BigInt(prev.cursor + 1);
  if (from > head) return prev;
  const { logs, upTo } = await fetchTransfers(addr, from, head);
  const tokens = new Set(prev.tokens);
  const byTx = new Map<string, { block: bigint; ins: Map<string, bigint>; outs: Map<string, bigint> }>();
  for (const l of logs) {
    let ev: { args: { from: Address; to: Address; value: bigint } };
    try { ev = decodeEventLog({ abi: erc20Abi, data: l.data, topics: l.topics }) as never; } catch { continue; }
    const token = lower(l.address);
    tokens.add(token);
    const g = byTx.get(l.transactionHash) ?? { block: BigInt(l.blockNumber), ins: new Map(), outs: new Map() };
    const isIn = lower(ev.args.to) === addr;
    const side = isIn ? g.ins : g.outs;
    side.set(token, (side.get(token) ?? 0n) + ev.args.value);
    byTx.set(l.transactionHash, g);
  }
  const meta = await tokenMeta(Array.from(tokens));
  const fresh: Trade[] = [];
  for (const [hash, g] of byTx) {
    const fmt = (m: Map<string, bigint>) => Array.from(m, ([token, v]) => ({ token, symbol: meta[token].symbol, amount: Number(formatUnits(v, meta[token].decimals)) }));
    const sold = fmt(g.outs), bought = fmt(g.ins);
    const kind: Trade['kind'] = sold.length && bought.length ? 'swap' : bought.length ? 'deposit' : 'withdrawal';
    fresh.push({ hash, block: Number(g.block), t: await blockTime(g.block, head, headTime), sold, bought, kind });
  }
  fresh.sort((a, b) => a.block - b.block);
  const next: Activity = { cursor: Number(upTo), trades: [...prev.trades, ...fresh].slice(-2000), tokens: Array.from(tokens), scannedAt: Date.now() };
  await store.saveActivity(addr, next);
  return next;
}

/** Live holdings and equity, from balances and prices, right now. */
export async function valuation(agent: Agent, activity: Activity): Promise<{ holdings: Holding[]; equity: number; deposits: number; withdrawals: number }> {
  const addr = lower(agent.address);
  const tokens = Array.from(new Set([lower(USDG), ...activity.tokens]));
  const meta = await tokenMeta(tokens);
  const [bals, eth, quotes] = await Promise.all([
    client.multicall({ contracts: tokens.map((t) => ({ address: t as Address, abi: erc20Abi, functionName: 'balanceOf', args: [addr] } as const)), allowFailure: true }),
    client.getBalance({ address: addr }),
    getQuotes([...tokens, WETH]),
  ]);
  const holdings: Holding[] = [];
  tokens.forEach((t, i) => {
    const r = bals[i]; if (r.status !== 'success') return;
    const amt = Number(formatUnits(r.result as bigint, meta[t].decimals));
    if (amt <= 0) return;
    const price = quotes[t]?.usd ?? 0;
    holdings.push({ token: t, symbol: meta[t].symbol, amount: amt, price, usd: amt * price });
  });
  const ethAmt = Number(formatUnits(eth, 18));
  if (ethAmt > 0) { const p = quotes[lower(WETH)]?.usd ?? 0; holdings.push({ token: 'eth', symbol: 'ETH', amount: ethAmt, price: p, usd: ethAmt * p }); }
  holdings.sort((a, b) => b.usd - a.usd);
  // Deposits and withdrawals are counted in dollars at today's price for
  // non-dollar tokens; USDG, which is what the sysop seeds, is exact.
  const val = (x: { token: string; amount: number }) => x.amount * (x.token === lower(USDG) ? 1 : quotes[x.token]?.usd ?? 0);
  const deposits = activity.trades.filter((t) => t.kind === 'deposit').reduce((s, t) => s + t.bought.reduce((a, b) => a + val(b), 0), 0);
  const withdrawals = activity.trades.filter((t) => t.kind === 'withdrawal').reduce((s, t) => s + t.sold.reduce((a, b) => a + val(b), 0), 0);
  return { holdings, equity: holdings.reduce((s, h) => s + h.usd, 0), deposits, withdrawals };
}

/** Full refresh of one muse: scan, value, remember. */
export async function refreshAgent(agent: Agent, head?: bigint, headTime?: number): Promise<Latest> {
  if (!head) { const b = await client.getBlock(); head = b.number; headTime = Number(b.timestamp) * 1000; }
  const activity = await scanActivity(agent, head, headTime!);
  const v = await valuation(agent, activity);
  const swaps = activity.trades.filter((t) => t.kind === 'swap');
  const latest: Latest = {
    at: Date.now(), block: Number(head), equity: v.equity, deposits: v.deposits, withdrawals: v.withdrawals,
    holdings: v.holdings, tradeCount: swaps.length, lastTradeAt: swaps.at(-1)?.t,
  };
  await store.saveLatest(agent.address, latest);
  const snaps = await store.snapshots(agent.address);
  const last = snaps.at(-1);
  // One point per five minutes is enough for a curve; the cron fires slower than that anyway.
  if (!last || latest.at - last.t > 5 * 60_000) {
    snaps.push({ t: latest.at, block: latest.block, equity: latest.equity, deposits: latest.deposits, withdrawals: latest.withdrawals, trades: latest.tradeCount });
    await store.saveSnapshots(agent.address, snaps.slice(-4000));
  }
  return latest;
}

export async function refreshAll(): Promise<{ agents: number; ms: number }> {
  const t0 = Date.now();
  const agents = await store.agents();
  const b = await client.getBlock();
  // Sequential on purpose: each muse is two log queries and a multicall, and the
  // RPC is happier with a steady stream than a burst.
  for (const a of agents) { try { await refreshAgent(a, b.number, Number(b.timestamp) * 1000); } catch (e) { console.error('refresh', a.name, e); } }
  return { agents: agents.length, ms: Date.now() - t0 };
}
