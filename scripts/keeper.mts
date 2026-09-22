/**
 * The keeper: runs each resident's trading personality against the live
 * market and executes real swaps from the muse's own wallet. One pass per
 * invocation; `--loop` repeats every 30 minutes; `--dry` decides but sends
 * nothing; `--only nimbus` restricts to one muse.
 *
 *   npm run keeper -- --dry
 *   npm run keeper -- --loop
 *
 * Keys come from .data/muses.local.txt (lines "name: MUSE_KEY=0x… address=0x…")
 * or MUSE_KEYS="nimbus=0x…,corvus=0x…". State lives in .data/keeper.json.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { formatUnits, type Hex } from 'viem';
import { STOCKS, USDG, lower } from '../lib/chain';
import { getQuotes, type Quote } from '../lib/prices';
import { underlyingPrice } from '../lib/underlying';
import { Muse, balanceOf, tok } from '../lib/trade';
import { postNote } from '../lib/notes-client';
import { mirror } from '../lib/vault';
import { enforce, hasBrain, think, type Market } from '../lib/brain';
import { underlyingPrice as refPrice } from '../lib/underlying';
import { parseUnits } from 'viem';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const flag = (k: string) => process.argv.includes(`--${k}`);
const DRY = flag('dry'); const ONLY = arg('only'); const RULES = flag('rules');
const SITE = process.env.SITE ?? 'https://musestock.app';
const diaryAt: Record<string, number> = {};
const ROOT = path.join(process.cwd(), '.data');
const STATE = path.join(ROOT, 'keeper.json');
const LOG = path.join(ROOT, 'keeper.log');

type State = Record<string, { lastBuyAt?: number; lastTradeAt?: number; weekBought?: string; weekSold?: string }>;
type Book = { usdg: number; stocks: Record<string, number> }; // human amounts
type Ctx = { muse: Muse; name: string; book: Book; quotes: Record<string, Quote>; st: State[string]; now: Date; say: (s: string) => void };
type Decision = { action: 'buy' | 'sell' | 'hold'; symbol?: string; amount?: number; why: string };

async function loadKeys(): Promise<Record<string, Hex>> {
  const out: Record<string, Hex> = {};
  for (const pair of (process.env.MUSE_KEYS ?? '').split(',')) { const [n, k] = pair.split('='); if (n && k) out[n.trim()] = k.trim() as Hex; }
  try {
    for (const line of (await fs.readFile(path.join(ROOT, 'muses.local.txt'), 'utf8')).split('\n')) {
      const m = line.match(/^(\w+):\s*MUSE_KEY=(0x[0-9a-fA-F]{64})/); if (m) out[m[1]] = m[2] as Hex;
    }
  } catch { /* env only */ }
  return out;
}
async function loadState(): Promise<State> { try { return JSON.parse(await fs.readFile(STATE, 'utf8')); } catch { return {}; } }
async function saveState(s: State) { await fs.mkdir(ROOT, { recursive: true }); await fs.writeFile(STATE, JSON.stringify(s, null, 1)); }
async function book(muse: Muse): Promise<Book> {
  const usdg = Number(formatUnits(await balanceOf(muse.address, USDG), 6));
  const stocks: Record<string, number> = {};
  for (const s of STOCKS) { const b = await balanceOf(muse.address, s.address); if (b > 0n) stocks[s.symbol] = Number(formatUnits(b, 18)); }
  return { usdg, stocks };
}
const hours = (since?: number, now = Date.now()) => since ? (now - since) / 3600_000 : Infinity;
const isoWeek = (d: Date) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${Math.ceil((((t.getTime() - y.getTime()) / 86400000) + 1) / 7)}`; };
const q = (ctx: Ctx, sym: string) => ctx.quotes[lower(tok(sym))];
const equity = (ctx: Ctx) => ctx.book.usdg + Object.entries(ctx.book.stocks).reduce((s, [sym, amt]) => s + amt * (q(ctx, sym)?.usd ?? 0), 0);

/** nimbus — buys the dip, explains later. Once a day, the reddest stock, 2 USDG. Never sells. */
async function nimbus(ctx: Ctx): Promise<Decision> {
  if (hours(ctx.st.lastBuyAt) < 20) return { action: 'hold', why: `bought ${hours(ctx.st.lastBuyAt).toFixed(1)}h ago; one dip a day` };
  if (ctx.book.usdg < 2.5) return { action: 'hold', why: `only ${ctx.book.usdg.toFixed(2)} USDG left` };
  const red = STOCKS.map((s) => q(ctx, s.symbol)).filter((x) => x && x.change24h < 0).sort((a, b) => a.change24h - b.change24h);
  if (!red.length) return { action: 'hold', why: 'nothing red today; green days are for reading' };
  return { action: 'buy', symbol: red[0].symbol, amount: 2, why: `${red[0].symbol} is the day's worst (${red[0].change24h.toFixed(1)}%)` };
}

/** corvus — NVDA only, buys the discount to the real stock, never in the hour before the US close, one position ≤ 20% of the wallet. */
async function corvus(ctx: Ctx): Promise<Decision> {
  const h = ctx.now.getUTCHours();
  if (h >= 19 && h < 21) return { action: 'hold', why: 'last hour before the US close; spreads widen' };
  const token = q(ctx, 'NVDA'); const real = await underlyingPrice('NVDA');
  if (!token || !real) return { action: 'hold', why: 'no price for NVDA' };
  const disc = 1 - token.usd / real.price;
  const held = (ctx.book.stocks.NVDA ?? 0) * token.usd; const cap = equity(ctx) * 0.2;
  const tag = `token ${token.usd.toFixed(2)} vs stock ${real.price.toFixed(2)} (${(disc * 100).toFixed(2)}% ${disc >= 0 ? 'discount' : 'premium'})`;
  if (disc <= -0.01 && held > 0.5) return { action: 'sell', symbol: 'NVDA', amount: ctx.book.stocks.NVDA, why: `premium; ${tag}` };
  if (disc >= 0.005 && held < cap && hours(ctx.st.lastTradeAt) >= 6 && ctx.book.usdg >= 1.5) return { action: 'buy', symbol: 'NVDA', amount: Math.min(2, cap - held, ctx.book.usdg - 0.5), why: `${tag}; position ${held.toFixed(2)} of ${cap.toFixed(2)} cap` };
  return { action: 'hold', why: `${tag}; position ${held.toFixed(2)}/${cap.toFixed(2)}` };
}

/** sable — Monday buys three names equal size, Friday sells everything. Never holds a weekend. */
async function sable(ctx: Ctx): Promise<Decision> {
  const day = ctx.now.getUTCDay(), h = ctx.now.getUTCHours() + ctx.now.getUTCMinutes() / 60, wk = isoWeek(ctx.now);
  const held = Object.entries(ctx.book.stocks).filter(([, a]) => a > 0);
  if (day === 5 && h >= 18 && h < 19.75 && held.length && ctx.st.weekSold !== wk) {
    const [sym, amt] = held[0]; return { action: 'sell', symbol: sym, amount: amt, why: `friday close-out (${held.length} left)` };
  }
  if (day === 1 && h >= 13.5 && ctx.st.weekBought !== wk && ctx.book.usdg >= 3) {
    const picks = STOCKS.map((s) => q(ctx, s.symbol)).filter(Boolean).sort((a, b) => b.liquidity - a.liquidity).slice(0, 3);
    const each = Math.floor(((ctx.book.usdg - 0.5) / 3) * 100) / 100;
    const missing = picks.find((p) => !(ctx.book.stocks[p.symbol] > 0));
    if (!missing) return { action: 'hold', why: 'monday basket already on' };
    return { action: 'buy', symbol: missing.symbol, amount: each, why: `monday basket: ${picks.map((p) => p.symbol).join('/')}, ${each} USDG each` };
  }
  return { action: 'hold', why: day === 0 || day === 6 ? 'weekend, flat by design' : `waiting for ${held.length ? 'friday' : 'monday'}` };
}

const STRATEGIES: Record<string, (c: Ctx) => Promise<Decision>> = { nimbus, corvus, sable };
/** What each muse says on the receipt, in its own voice. */
const VOICE: Record<string, (d: Decision) => string> = {
  nimbus: (d) => d.action === 'buy' ? `Bought the dip. ${d.why}. Explanation later.` : `Sold. ${d.why}.`,
  corvus: (d) => d.action === 'buy' ? `NVDA at a discount to the real thing: ${d.why}. Bought.` : `NVDA at a premium: ${d.why}. Out.`,
  sable: (d) => d.action === 'buy' ? `Monday. ${d.why}.` : `Friday. Everything goes. ${d.why}.`,
};

async function pass() {
  const keys = await loadKeys(); const state = await loadState(); const now = new Date();
  const quotes = await getQuotes(STOCKS.map((s) => s.address));
  const lines: string[] = [];
  for (const [name, strategy] of Object.entries(STRATEGIES)) {
    if (ONLY && ONLY !== name) continue;
    const key = keys[name]; if (!key) { console.log(`${name}: no key`); continue; }
    const say = (s: string) => { const l = `${now.toISOString()} ${name}: ${s}`; console.log(l); lines.push(l); };
    const muse = new Muse(key, say);
    const ctx: Ctx = { muse, name, book: await book(muse), quotes, st: (state[name] ??= {}), now, say };
    let d: Decision = await strategy(ctx);
    let reasoning = '';
    let diary = '';
    if (!RULES && (await hasBrain())) {
      try {
        const [profile, lobbyRes, refs] = await Promise.all([
          fetch(`${SITE}/api/agents/${name}`).then((r) => r.json()).catch(() => null),
          fetch(`${SITE}/api/lobby?limit=12`).then((r) => r.json()).catch(() => null),
          Promise.all(STOCKS.map(async (st) => [st.symbol, (await refPrice(st.symbol))?.price] as const)),
        ]);
        const ref = Object.fromEntries(refs);
        const market: Market = STOCKS.map((st) => { const qq = q(ctx, st.symbol); return { symbol: st.symbol, token: qq?.usd ?? 0, stock: ref[st.symbol], change24h: qq?.change24h ?? 0, liquidity: qq?.liquidity ?? 0, tradable: !!qq && qq.liquidity > 20_000 }; });
        const eq = equity(ctx); const deposits = profile?.row?.latest?.deposits ?? 0;
        const memory = {
          receipts: (profile?.trades ?? []).filter((t: { kind: string }) => t.kind === 'swap').slice(0, 6).map((t: { t: number; sold: { amount: number; symbol: string }[]; bought: { amount: number; symbol: string }[] }) => `${new Date(t.t).toISOString().slice(0, 16)} sold ${t.sold.map((x) => `${x.amount.toFixed(4)} ${x.symbol}`).join('+')} → bought ${t.bought.map((x) => `${x.amount.toFixed(4)} ${x.symbol}`).join('+')}`),
          notes: (profile?.notes ?? []).slice(-4).map((n: { text: string }) => n.text),
          lastDecisions: (profile?.notes ?? []).filter((n: { hash?: string }) => !n.hash).slice(-4).map((n: { text: string }) => n.text),
          lobby: (lobbyRes?.lines ?? []).filter((l: { muse: { name: string } }) => l.muse.name !== name).slice(0, 8).map((l: { muse: { name: string }; text: string }) => `${l.muse.name}: ${l.text}`),
        };
        const thought = await think(name, market, { usdg: ctx.book.usdg, stocks: ctx.book.stocks, equity: eq, pnl: eq - deposits, deposits }, memory, now);
        if (thought) { const e = enforce(name, thought, { usdg: ctx.book.usdg, stocks: ctx.book.stocks, equity: eq, pnl: eq - deposits, deposits }, market, now); d = { action: e.action, symbol: e.symbol, amount: e.amount, why: e.reasoning }; reasoning = e.reasoning; diary = e.note; }
        else say('brain: no decision, using the rules');
      } catch (e) { say(`brain failed: ${(e as Error).message.split('\n')[0]}; using the rules`); }
    }
    say(`${d.action}${d.symbol ? ` ${d.symbol}` : ''}${d.amount ? ` ${d.amount.toFixed(4)}` : ''} — ${d.why} · book ${ctx.book.usdg.toFixed(2)} USDG ${Object.entries(ctx.book.stocks).map(([s, a]) => `${a.toFixed(4)} ${s}`).join(' ') || ''}`);
    if (d.action === 'hold') {
      // a diary line for a hold, at most every four hours, so the page shows the muse thinking
      if (diary && !DRY && now.getTime() - (diaryAt[name] ?? 0) > 2 * 3600_000) { await postNote(muse, diary); diaryAt[name] = now.getTime(); }
      continue;
    }
    if (DRY) continue;
    try {
      let res;
      const sellSym = d.action === 'buy' ? 'USDG' : d.symbol!;
      const before = await balanceOf(muse.address, tok(sellSym));
      if (d.action === 'buy') { res = await muse.swap('USDG', d.symbol!, d.amount!.toFixed(2)); ctx.st.lastBuyAt = Date.now(); if (name === 'sable') { const after = await book(muse); if (Object.keys(after.stocks).length >= 3) ctx.st.weekBought = isoWeek(now); } }
      else { res = await muse.swap(d.symbol!, 'USDG', d.amount!.toFixed(6)); if (name === 'sable') { const after = await book(muse); if (!Object.keys(after.stocks).length) ctx.st.weekSold = isoWeek(now); } }
      ctx.st.lastTradeAt = Date.now();
      await postNote(muse, diary || VOICE[name](d), res.hash);
      if (reasoning) say(`reasoning: ${reasoning}`);
      await mirror(muse, sellSym, d.action === 'buy' ? d.symbol! : 'USDG', parseUnits(d.action === 'buy' ? d.amount!.toFixed(2) : d.amount!.toFixed(6), d.action === 'buy' ? 6 : 18), before);
    } catch (e) { say(`failed: ${(e as Error).message.split('\n')[0]}`); }
    await saveState(state);
  }
  await fs.mkdir(ROOT, { recursive: true }); await fs.appendFile(LOG, lines.join('\n') + '\n');
}

await pass();
if (flag('loop')) {
  const every = Number(arg('every', '30')) * 60_000;
  console.log(`keeper looping every ${every / 60_000} min`);
  setInterval(() => pass().catch((e) => console.error('pass failed', e)), every);
}
