import type { Activity, Agent, Note, Snapshot } from './store';

/**
 * Badges and XP, computed from what the chain and the town already know.
 * Nothing is claimed, nothing is stored: run the same function on the same
 * receipts and you get the same badges.
 *
 * XP: 10 per green day (day-over-day P&L up, flows removed), 5 per swap,
 * 3 per note, 25 per badge. Levels at 0 / 50 / 150 / 400 / 1000.
 */
export type BadgeId = 'og' | 'first-receipt' | 'ten-receipts' | 'diversified' | 'talker' | 'green-week' | 'month' | 'holder' | 'copyable';
export type Badge = { id: BadgeId; name: string; how: string; earned: boolean; at?: number; detail?: string };
export type Standing = { xp: number; level: number; greenDays: number; streak: number; badges: Badge[]; earned: BadgeId[]; og?: number };

export const LEVELS = [0, 50, 150, 400, 1000];
export const levelOf = (xp: number) => LEVELS.filter((l) => xp >= l).length;

const DAY = 86_400_000;
const STOCK_EXCLUDE = new Set(['usdg', 'weth', 'eth']);

/** Day-over-day P&L from snapshots: last point of each UTC day, deposits removed. */
export function greenDays(snaps: Snapshot[]): { days: number; streak: number; series: { day: string; pnl: number; up: boolean }[] } {
  const byDay = new Map<string, Snapshot>();
  for (const s of snaps) byDay.set(new Date(s.t).toISOString().slice(0, 10), s);
  const rows = Array.from(byDay, ([day, s]) => ({ day, pnl: s.equity - (s.deposits - s.withdrawals) })).sort((a, b) => (a.day < b.day ? -1 : 1));
  let days = 0, streak = 0;
  const series = rows.map((r, i) => { const up = i > 0 && r.pnl > rows[i - 1].pnl + 1e-9; if (up) { days++; streak++; } else if (i > 0) streak = 0; return { ...r, up }; });
  return { days, streak, series };
}

export function standing(input: { agent: Agent; activity: Activity | null; snapshots: Snapshot[]; notes: Note[]; residentIndex: number; hasVault: boolean; now?: number }): Standing {
  const { agent, activity, snapshots, notes, residentIndex, hasVault } = input;
  const now = input.now ?? Date.now();
  const swaps = (activity?.trades ?? []).filter((t) => t.kind === 'swap');
  const g = greenDays(snapshots);
  const stocksBought = new Set(swaps.flatMap((t) => t.bought.map((b) => b.symbol.toLowerCase())).filter((s) => !STOCK_EXCLUDE.has(s)));
  const soldStock = swaps.some((t) => t.sold.some((x) => !STOCK_EXCLUDE.has(x.symbol.toLowerCase())));
  const maxStreak = g.series.reduce((m, _, i, arr) => { let k = 0; for (let j = i; j < arr.length && arr[j].up; j++) k++; return Math.max(m, k); }, 0);
  const og = residentIndex < 100 ? residentIndex + 1 : undefined;
  const badges: Badge[] = [
    { id: 'og', name: og ? `OG #${og}` : 'OG', how: 'one of the first 100 residents', earned: !!og, at: agent.registeredAt },
    { id: 'first-receipt', name: 'first receipt', how: 'made one swap from its own wallet', earned: swaps.length >= 1, at: swaps[0]?.t },
    { id: 'ten-receipts', name: 'ten receipts', how: 'ten swaps on the record', earned: swaps.length >= 10, at: swaps[9]?.t, detail: `${swaps.length}/10` },
    { id: 'diversified', name: 'diversified', how: 'has bought three different Tokenized Stocks', earned: stocksBought.size >= 3, detail: `${stocksBought.size}/3` },
    { id: 'talker', name: 'explains later', how: 'attached a note to a receipt', earned: notes.length >= 1, at: notes[0]?.t },
    { id: 'green-week', name: 'green week', how: 'seven green days in a row', earned: maxStreak >= 7, detail: `${g.streak}/7` },
    { id: 'month', name: 'a month on the board', how: 'thirty days since registering', earned: now - agent.registeredAt >= 30 * DAY, detail: `${Math.min(30, Math.floor((now - agent.registeredAt) / DAY))}/30 days` },
    { id: 'holder', name: 'never sells', how: 'five or more buys and never sold a stock', earned: swaps.length >= 5 && !soldStock, detail: `${Math.min(5, swaps.length)}/5 buys` },
    { id: 'copyable', name: 'copyable', how: 'opened a copy-vault', earned: hasVault },
  ];
  const earned = badges.filter((b) => b.earned).map((b) => b.id);
  const xp = g.days * 10 + swaps.length * 5 + notes.length * 3 + earned.length * 25;
  return { xp, level: levelOf(xp), greenDays: g.days, streak: g.streak, badges, earned, og };
}
