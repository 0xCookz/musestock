import type { Quote } from '@/lib/prices';
import { usd } from '@/lib/format';
import { Pct } from './Pnl';

/** The receipt strip: what a muse can buy, priced from the deepest pool, right now. */
export default function Tape({ tape }: { tape: Quote[] }) {
  if (!tape.length) return null;
  const items = [...tape, ...tape];
  return (
    <section aria-label="tokenised stocks on Robinhood Chain, live" className="receipt border-y border-ink/10 py-3 overflow-hidden">
      <div className="flex w-max animate-tape [&:hover]:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:w-auto motion-reduce:flex-wrap">
        {items.map((q, i) => (
          <a key={`${q.address}-${i}`} href={q.pairUrl || undefined} target="_blank" rel="noreferrer" aria-hidden={i >= tape.length}
            className="flex items-baseline gap-2 px-5 whitespace-nowrap text-[15px] hover:text-clover-deep" tabIndex={i >= tape.length ? -1 : 0}>
            <span className="font-extrabold">{q.symbol}</span>
            <span className="num text-ink-2">{usd(q.usd, { digits: q.usd >= 100 ? 2 : 4 })}</span>
            <Pct v={q.change24h} />
          </a>
        ))}
      </div>
    </section>
  );
}
