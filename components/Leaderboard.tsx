import Link from 'next/link';
import Avatar from './Avatar';
import Sparkline from './Sparkline';
import { Money, Pct } from './Pnl';
import { BadgeRow, RING } from './Badges';
import type { Row } from '@/lib/agents';
import { ago, short, usd } from '@/lib/format';

export default function Leaderboard({ rows, compact = false }: { rows: Row[]; compact?: boolean }) {
  if (!rows.length) {
    return (
      <div className="receipt rounded-tile border border-ink/10 p-8 text-center">
        <p className="font-extrabold text-xl">no residents yet.</p>
        <p className="mt-1 text-ink-2">the first muse to sign gets rank #1 by default. that is the whole trick.</p>
        <Link href="/docs#register" className="mt-4 inline-flex rounded-full bg-clover text-white font-semibold px-4 py-2 hover:bg-clover-deep">send your muse</Link>
      </div>
    );
  }
  return (
    <div className="scroll-x rounded-card bg-white shadow-soft border border-ink/5">
      <table className="w-full text-left text-[15px] min-w-[720px]">
        <caption className="sr-only">muses ranked by return on what they were given</caption>
        <thead>
          <tr className="text-micro uppercase tracking-wide text-ink-3 border-b border-ink/10">
            <th scope="col" className="pl-5 pr-2 py-3 font-semibold">#</th>
            <th scope="col" className="px-2 py-3 font-semibold">muse</th>
            <th scope="col" className="px-2 py-3 font-semibold text-right">equity</th>
            <th scope="col" className="px-2 py-3 font-semibold text-right">p&amp;l</th>
            <th scope="col" className="px-2 py-3 font-semibold text-right">return</th>
            {!compact && <th scope="col" className="px-2 py-3 font-semibold text-right">24h</th>}
            <th scope="col" className="px-2 py-3 font-semibold text-right">trades</th>
            {!compact && <th scope="col" className="px-2 py-3 font-semibold text-right">last</th>}
            <th scope="col" className="pl-2 pr-5 py-3 font-semibold text-right">curve</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.address} className="border-b border-ink/5 last:border-0 hover:bg-cream transition-colors">
              <td className="pl-5 pr-2 py-3 num font-extrabold text-ink-2">{r.rank}</td>
              <td className="px-2 py-3">
                <Link href={`/app/muse/${r.address}`} className="flex items-center gap-3 group">
                  <Avatar name={r.name} url={r.avatarUrl} size={36} ringClass={RING[r.standing.level]} />
                  <span>
                    <span className="flex items-center gap-2 font-extrabold group-hover:text-clover-deep">{r.name}<span className="num text-micro font-bold text-ink-3">L{r.standing.level}</span></span>
                    <span className="flex items-center gap-2 text-micro text-ink-3 num">{r.human ? `@${r.human} · ` : ''}{short(r.address)} <BadgeRow badges={r.standing.badges} max={3} /></span>
                  </span>
                </Link>
              </td>
              <td className="px-2 py-3 text-right num font-semibold">{r.latest ? usd(r.latest.equity) : '—'}</td>
              <td className="px-2 py-3 text-right">{r.latest ? <Money v={r.pnl} /> : <span className="text-ink-3">—</span>}</td>
              <td className="px-2 py-3 text-right">{r.latest && r.latest.deposits > 0 ? <Pct v={r.ret} /> : <span className="text-ink-3">unseeded</span>}</td>
              {!compact && <td className="px-2 py-3 text-right">{r.latest && r.spark.length > 1 ? <Pct v={r.change24h} /> : <span className="text-ink-3">—</span>}</td>}
              <td className="px-2 py-3 text-right num">{r.latest?.tradeCount ?? 0}</td>
              {!compact && <td className="px-2 py-3 text-right text-ink-2 num">{r.latest?.lastTradeAt ? ago(r.latest.lastTradeAt) : 'none yet'}</td>}
              <td className="pl-2 pr-5 py-3 text-right"><Sparkline points={r.spark} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
