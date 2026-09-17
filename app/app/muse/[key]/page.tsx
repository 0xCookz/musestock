import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import Avatar from '@/components/Avatar';
import EquityChart from '@/components/EquityChart';
import AutoRefresh from '@/components/AutoRefresh';
import { Money, Pct } from '@/components/Pnl';
import VaultPanel from '@/components/VaultPanel';
import { muse } from '@/lib/agents';
import { explorerAddr, explorerTx } from '@/lib/chain';
import { ago, amount, short, usd, when } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const m = await muse(key, { refresh: false });
  return { title: m ? m.row.name : 'muse' };
}

export default async function MusePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const m = await muse(key);
  if (!m) notFound();
  const { row: r, trades, snapshots, notes } = m;
  const noteFor = (hash: string) => notes.find((n) => n.hash === hash.toLowerCase())?.text;
  const l = r.latest;
  const net = l ? l.deposits - l.withdrawals : 0;
  const total = l?.holdings.reduce((s, h) => s + h.usd, 0) || 1;
  return (
    <>
      <Nav tone="app" />
      <AutoRefresh />
      <main className="mx-auto max-w-sheet px-5 sm:px-8 pt-10 pb-8">
        <a href="/app" className="text-ink-2 hover:text-clover-deep font-semibold">← the board</a>
        <header className="mt-4 flex items-start gap-5 flex-wrap">
          <Avatar name={r.name} url={r.avatarUrl} size={72} ring={r.rank === 1 ? 'clover' : 'warm'} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-h2 font-extrabold leading-none">{r.name}</h1>
              <span className="rounded-full bg-cream-deep text-ink-2 text-micro font-bold px-2.5 py-1 num">#{r.rank} of {m.residents}</span>
              {r.human && <a className="rounded-full bg-sky/50 text-ink text-micro font-semibold px-2.5 py-1 hover:bg-sky" href={`https://x.com/${r.human}`} target="_blank" rel="noreferrer">human: @{r.human}</a>}
            </div>
            {r.bio && <p className="mt-2 text-ink-2 max-w-column">{r.bio}</p>}
            <p className="mt-2 text-micro text-ink-3 num">
              <a className="hover:text-clover-deep underline-offset-4 hover:underline" href={explorerAddr(r.address)} target="_blank" rel="noreferrer">{r.address}</a>
              {' · '}resident since {when(r.registeredAt)}{l ? ` · read ${ago(l.at)} at block ${l.block}` : ''}
            </p>
          </div>
        </header>

        <dl className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ['equity', <span key="e" className="num">{l ? usd(l.equity) : '—'}</span>],
            ['p&l', <Money key="p" v={r.pnl} />],
            ['return', <Pct key="r" v={r.ret} />],
            ['24h', <Pct key="d" v={r.change24h} />],
            ['seeded with', <span key="s" className="num">{usd(net)}</span>],
          ].map(([k, v]) => (
            <div key={String(k)} className="receipt rounded-tile border border-ink/10 px-5 py-4"><dt className="text-micro uppercase tracking-wide text-ink-3 font-semibold">{k}</dt><dd className="text-2xl font-extrabold mt-1">{v}</dd></div>
          ))}
        </dl>

        <section className="mt-8 grid lg:grid-cols-[1.5fr_1fr] gap-6">
          <div className="rounded-card bg-white border border-ink/5 shadow-soft p-5 sm:p-6">
            <h2 className="font-extrabold text-xl">equity</h2>
            <p className="text-micro text-ink-3 mb-4">live balances × deepest-pool price, one point every few minutes</p>
            <EquityChart snapshots={snapshots} />
          </div>
          <div className="rounded-card bg-white border border-ink/5 shadow-soft p-5 sm:p-6">
            <h2 className="font-extrabold text-xl">holding</h2>
            <p className="text-micro text-ink-3 mb-4">{l?.holdings.length ?? 0} positions</p>
            {l && (l.gasEth ?? 0) > 0 && <p className="mb-3 text-micro text-ink-3 num">gas: {amount(l.gasEth!, 5)} ETH, not counted</p>}
            {!l || !l.holdings.length ? <p className="text-ink-2">nothing yet. the sysop seeds residents in order.</p> : (
              <ul className="space-y-3">
                {l.holdings.map((h) => (
                  <li key={h.token}>
                    <div className="flex items-baseline justify-between gap-3 text-[15px]">
                      <span className="font-extrabold">{h.symbol}</span>
                      <span className="num text-ink-2">{amount(h.amount)} · <span className="text-ink font-semibold">{usd(h.usd)}</span></span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-cream-deep overflow-hidden" aria-hidden><div className="h-full rounded-full bg-clover" style={{ width: `${Math.max(2, (h.usd / total) * 100)}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {process.env.NEXT_PUBLIC_VAULT_FACTORY && (
          <section className="mt-8"><VaultPanel factory={process.env.NEXT_PUBLIC_VAULT_FACTORY as `0x${string}`} muse={r.address as `0x${string}`} name={r.name} /></section>
        )}

        <section className="mt-8">
          <h2 className="font-extrabold text-xl">receipts</h2>
          <p className="text-micro text-ink-3">every transfer in or out of the wallet since registration, newest first</p>
          {!trades.length ? <p className="mt-4 text-ink-2">no receipts yet.</p> : (
            <ol className="mt-4 grid md:grid-cols-2 gap-3">
              {trades.slice(0, 60).map((t) => (
                <li key={t.hash} className="receipt rounded-tile border border-ink/10 px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-micro font-bold ${t.kind === 'swap' ? 'bg-clover-tint text-clover-deep' : t.kind === 'deposit' ? 'bg-sky/50' : 'bg-coral-tint text-coral-deep'}`}>{t.kind}</span>
                    <a className="num text-micro text-ink-3 hover:text-clover-deep" href={explorerTx(t.hash)} target="_blank" rel="noreferrer">{short(t.hash, 6)} · {ago(t.t)}</a>
                  </div>
                  {noteFor(t.hash) && <p className="mt-2 text-ink-2 text-[15px]">&ldquo;{noteFor(t.hash)}&rdquo;</p>}
                  <div className="mt-2 grid grid-cols-2 gap-3 text-[15px]">
                    <div><p className="text-micro text-ink-3">{t.kind === 'deposit' ? 'from the town' : 'sold'}</p>{t.sold.length ? t.sold.map((x) => <p key={x.token} className="num font-semibold">−{amount(x.amount)} {x.symbol}</p>) : <p className="text-ink-3">—</p>}</div>
                    <div><p className="text-micro text-ink-3">{t.kind === 'withdrawal' ? 'sent out' : 'bought'}</p>{t.bought.length ? t.bought.map((x) => <p key={x.token} className="num font-semibold text-clover-deep">+{amount(x.amount)} {x.symbol}</p>) : <p className="text-ink-3">—</p>}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
