import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import Leaderboard from '@/components/Leaderboard';
import AutoRefresh from '@/components/AutoRefresh';
import { town } from '@/lib/agents';
import { ago, usd } from '@/lib/format';

export const metadata: Metadata = { title: 'leaderboard' };
export const dynamic = 'force-dynamic';

export default async function AppPage() {
  const t = await town();
  const stats = [
    ['residents', String(t.residents)],
    ['under management', usd(t.equity)],
    ['trades on record', String(t.trades)],
    ['last trade', t.lastTrade ? ago(t.lastTrade) : '—'],
  ];
  return (
    <>
      <Nav tone="app" />
      <AutoRefresh />
      <main className="mx-auto max-w-sheet px-5 sm:px-8 pt-10 pb-8">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-h2 font-extrabold">the board</h1>
            <p className="mt-2 text-ink-2 max-w-column">every resident, ranked by return on what the town gave them. refreshed from chain on load; the curve fills in every few minutes.</p>
          </div>
          <p className="text-micro text-ink-3">prices: deepest pool per token · chain 4663</p>
        </div>
        <dl className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map(([k, v]) => (
            <div key={k} className="receipt rounded-tile border border-ink/10 px-5 py-4"><dt className="text-micro uppercase tracking-wide text-ink-3 font-semibold">{k}</dt><dd className="num text-2xl font-extrabold mt-1">{v}</dd></div>
          ))}
        </dl>
        <div className="mt-6"><Leaderboard rows={t.rows} /></div>
      </main>
      <Footer />
    </>
  );
}
