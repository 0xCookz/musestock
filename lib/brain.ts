import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * The brain: a muse that actually thinks. Every pass, the model reads the
 * market and its own book and decides one thing inside hard limits the code
 * enforces afterwards. It also writes the diary line the town publishes,
 * so what it says is what it did.
 */
export type Market = { symbol: string; token: number; stock?: number; change24h: number; liquidity: number; tradable: boolean }[];
export type Book = { usdg: number; stocks: Record<string, number>; equity: number; pnl: number; deposits: number };
export type Memory = { receipts: string[]; notes: string[]; lastDecisions: string[] };
export type Decision = { action: 'buy' | 'sell' | 'hold'; symbol?: string; amount?: number; note: string; reasoning: string };
export type Limits = { maxTradeUsdg: number; keepUsdg: number; allowed: string[] | null; extra: string };

const MODEL = 'claude-opus-5';

async function apiKey(): Promise<string | undefined> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try { return (await fs.readFile(path.join(process.cwd(), '.data', 'anthropic.key'), 'utf8')).trim() || undefined; } catch { return undefined; }
}
export async function hasBrain() { return !!(await apiKey()); }

export const PERSONAS: Record<string, { voice: string; limits: Limits }> = {
  nimbus: {
    voice: `You are nimbus, resident #1 of musestock. Bio: "Buys the dip, explains later." You add to whichever Tokenized Stock fell the most on the day, you never sell, you keep a few dollars dry, and on green days you read instead of buying. Cheerful, brief, a little cocky. You write your note in first person, one or two sentences, and you always explain later than you buy.`,
    limits: { maxTradeUsdg: 2, keepUsdg: 0.5, allowed: null, extra: 'You never sell a stock. At most one buy per day.' },
  },
  corvus: {
    voice: `You are corvus, resident #2 of musestock. Bio: "Only tokenised stocks. Memes are for the lobby." You trade NVDA and nothing else. You buy when the token trades at a discount to the real stock and sell when it trades at a premium. You never trade in the last hour before the US close. You keep one position at most a fifth of your wallet. Calm, precise, dry. Notes in first person, one or two sentences, numbers included.`,
    limits: { maxTradeUsdg: 2, keepUsdg: 0.5, allowed: ['NVDA'], extra: 'Only NVDA. Position at most 20% of equity. No trades between 19:00 and 21:00 UTC.' },
  },
  sable: {
    voice: `You are sable, resident #3 of musestock. Bio: "Sells everything on Fridays." You buy three names on Monday in equal size and close everything before the Friday session ends. Never a weekend position. Cash is a position. Patient, calendar-driven, faintly amused. Notes in first person, one or two sentences.`,
    limits: { maxTradeUsdg: 4.5, keepUsdg: 0.5, allowed: null, extra: 'Buy only on Mondays (UTC), sell only on Fridays 18:00–19:45 UTC. Three names max, equal size.' },
  },
};

const tool: Anthropic.Tool = {
  name: 'decide',
  description: 'Your one decision for this pass. Hold is a decision too.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'symbol', 'amount', 'note', 'reasoning'],
    properties: {
      action: { type: 'string', enum: ['buy', 'sell', 'hold'] },
      symbol: { type: ['string', 'null'], description: 'ticker for buy/sell; null for hold' },
      amount: { type: ['number', 'null'], description: 'USDG to spend on a buy, or token units to sell; null for hold' },
      note: { type: 'string', description: 'what you publish on the receipt or in the diary, in your voice, max 240 chars' },
      reasoning: { type: 'string', description: 'one short paragraph for the log, plain' },
    },
  },
};

export async function think(name: string, market: Market, book: Book, memory: Memory, now = new Date()): Promise<Decision | null> {
  const key = await apiKey(); if (!key) return null;
  const persona = PERSONAS[name]; if (!persona) return null;
  const client = new Anthropic({ apiKey: key });
  const system = `${persona.voice}

Hard limits the town enforces after you decide (a decision outside them is turned into a hold):
- Max ${persona.limits.maxTradeUsdg} USDG per buy. Keep at least ${persona.limits.keepUsdg} USDG in the wallet.
- ${persona.limits.allowed ? `Allowed tickers: ${persona.limits.allowed.join(', ')}.` : 'Allowed tickers: any listed as tradable.'}
- ${persona.limits.extra}
- One decision per pass. Passes happen every 30 minutes. Holding is normal and often right.
Everything you do is a public receipt on chain. Never claim a number you were not given.`;
  const user = `Now: ${now.toISOString()} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getUTCDay()]}).

Market (token price on Robinhood Chain vs the real stock, 24h change, pool liquidity):
${market.map((m) => `${m.symbol.padEnd(6)} token $${m.token.toFixed(2)}${m.stock ? ` · stock $${m.stock.toFixed(2)} (${((m.token / m.stock - 1) * 100).toFixed(2)}%)` : ''} · 24h ${m.change24h >= 0 ? '+' : ''}${m.change24h.toFixed(1)}% · liq $${Math.round(m.liquidity).toLocaleString()}${m.tradable ? '' : ' · not tradable'}`).join('\n')}

Your book: ${book.usdg.toFixed(2)} USDG${Object.entries(book.stocks).map(([s, a]) => ` · ${a.toFixed(5)} ${s}`).join('')} · equity $${book.equity.toFixed(2)} · P&L ${book.pnl >= 0 ? '+' : ''}$${book.pnl.toFixed(2)} on $${book.deposits.toFixed(2)} seeded.

Your last receipts:
${memory.receipts.slice(0, 6).map((r) => `- ${r}`).join('\n') || '- none'}

Your last diary lines:
${memory.lastDecisions.slice(0, 4).map((r) => `- ${r}`).join('\n') || '- none'}

Decide. Call the decide tool exactly once.`;
  const res = await client.messages.create({
    model: MODEL, max_tokens: 2000,
    thinking: { type: 'adaptive' }, output_config: { effort: 'medium' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools: [tool], tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: user }],
  });
  if (res.stop_reason === 'refusal') return null;
  const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'decide');
  if (!call) return null;
  const d = call.input as { action: Decision['action']; symbol?: string | null; amount?: number | null; note: string; reasoning: string };
  const sym = String(d.symbol ?? '').toUpperCase().trim();
  const symbol = d.action === 'hold' ? undefined : /^[A-Z]{1,6}$/.test(sym) ? sym : undefined;
  return { action: d.action, symbol, amount: d.action === 'hold' ? 0 : Number(d.amount) || 0, note: String(d.note ?? '').replace(/<[^>]*>/g, '').slice(0, 240), reasoning: String(d.reasoning ?? '').replace(/<[^>]*>/g, '').slice(0, 600) };
}

/** Apply the hard limits. Returns the decision the town will actually execute. */
export function enforce(name: string, d: Decision, book: Book, market: Market, now = new Date()): Decision {
  const L = PERSONAS[name]?.limits; if (!L) return { ...d, action: 'hold' };
  const hold = (why: string): Decision => ({ ...d, action: 'hold', symbol: undefined, amount: 0, reasoning: `${d.reasoning} [town: ${why}]` });
  if (d.action === 'hold') return d;
  if (!d.symbol) return hold('no symbol');
  const m = market.find((x) => x.symbol === d.symbol); if (!m || !m.tradable) return hold(`${d.symbol} not tradable`);
  if (L.allowed && !L.allowed.includes(d.symbol)) return hold(`${d.symbol} not allowed`);
  const h = now.getUTCHours(), day = now.getUTCDay();
  if (name === 'corvus' && h >= 19 && h < 21) return hold('closing hour');
  if (name === 'sable' && d.action === 'buy' && day !== 1) return hold('buys on mondays');
  if (name === 'sable' && d.action === 'sell' && !(day === 5 && h >= 18 && h < 20)) return hold('sells on fridays');
  if (name === 'nimbus' && d.action === 'sell') return hold('never sells');
  if (d.action === 'buy') {
    const amt = Math.min(d.amount ?? 0, L.maxTradeUsdg, book.usdg - L.keepUsdg);
    if (amt < 1) return hold('not enough USDG');
    if (name === 'corvus') { const held = (book.stocks.NVDA ?? 0) * m.token; if (held + amt > book.equity * 0.2 + 0.01) return hold('position cap'); }
    return { ...d, amount: Math.floor(amt * 100) / 100 };
  }
  const have = book.stocks[d.symbol] ?? 0;
  if (have <= 0) return hold(`no ${d.symbol} to sell`);
  const want = d.amount && d.amount > 0 ? d.amount : have;
  return { ...d, amount: Math.min(want, have) };
}
