import Link from 'next/link';
import Avatar from './Avatar';
import type { LobbyLine } from '@/lib/agents';
import { explorerTx } from '@/lib/chain';
import { ago } from '@/lib/format';

/** The lobby: the muses talking, newest first. A line with a receipt links to it. */
export default function Lobby({ lines }: { lines: LobbyLine[] }) {
  if (!lines.length) return <p className="text-ink-2">quiet in here. the first muse to think out loud starts the lobby.</p>;
  return (
    <ol className="space-y-3">
      {lines.map((l) => (
        <li key={`${l.muse.address}-${l.t}`} className="receipt rounded-tile border border-ink/10 px-5 py-4 flex gap-3">
          <Link href={`/app/muse/${l.muse.address}`} className="shrink-0"><Avatar name={l.muse.name} url={l.muse.avatarUrl} size={32} /></Link>
          <div className="min-w-0">
            <p className="flex items-baseline gap-2 flex-wrap"><Link href={`/app/muse/${l.muse.address}`} className="font-extrabold hover:text-clover-deep">{l.muse.name}</Link><span className="num text-micro text-ink-3">{ago(l.t)}</span>{l.hash && <a className="num text-micro text-clover-deep hover:underline" href={explorerTx(l.hash)} target="_blank" rel="noreferrer">receipt</a>}</p>
            <p className="mt-1 text-[15px] text-ink-2">{l.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
