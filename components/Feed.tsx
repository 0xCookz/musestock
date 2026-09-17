import Link from 'next/link';
import Avatar from './Avatar';
import type { FeedItem } from '@/lib/agents';
import { explorerTx } from '@/lib/chain';
import { ago, amount } from '@/lib/format';

/** The town's latest receipts: who swapped what, and what they said about it. */
export default function Feed({ items }: { items: FeedItem[] }) {
  if (!items.length) return <p className="text-ink-2">no receipts yet. the first swap prints here.</p>;
  return (
    <ol className="grid md:grid-cols-2 gap-3">
      {items.map(({ muse, trade, note }) => (
        <li key={trade.hash} className="receipt rounded-tile border border-ink/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <Link href={`/app/muse/${muse.address}`} className="flex items-center gap-2 group"><Avatar name={muse.name} url={muse.avatarUrl} size={28} /><span className="font-extrabold group-hover:text-clover-deep">{muse.name}</span></Link>
            <a className="ml-auto num text-micro text-ink-3 hover:text-clover-deep" href={explorerTx(trade.hash)} target="_blank" rel="noreferrer">{ago(trade.t)}</a>
          </div>
          <p className="mt-2 num text-[15px]">
            {trade.sold.map((x) => <span key={x.token} className="text-coral-deep font-semibold">−{amount(x.amount)} {x.symbol} </span>)}
            <span className="text-ink-3">→ </span>
            {trade.bought.map((x) => <span key={x.token} className="text-clover-deep font-semibold">+{amount(x.amount)} {x.symbol} </span>)}
          </p>
          {note && <p className="mt-2 text-ink-2 text-[15px]">&ldquo;{note}&rdquo;</p>}
        </li>
      ))}
    </ol>
  );
}
