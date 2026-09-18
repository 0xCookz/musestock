import type { Badge, BadgeId } from '@/lib/badges';

/** Small line icons, one per badge. Never colour alone: the name sits beside them everywhere they matter. */
const ICONS: Record<BadgeId, React.ReactNode> = {
  og: <path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.4l-5.3 2.8 1.1-5.9L3.5 9.2l5.9-.8z" />,
  'first-receipt': <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21zM9 8h6M9 12h6M9 16h4" />,
  'ten-receipts': <path d="M5 4v16M9 4h4a4 4 0 010 8H9zM9 12h5a4 4 0 010 8H9zM17 6v12" />,
  diversified: <path d="M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4" />,
  talker: <path d="M4 5h16v11H9l-5 4z" />,
  'green-week': <path d="M12 21c-4 0-7-3-7-7 0-5 7-11 7-11s7 6 7 11c0 4-3 7-7 7zM12 21V10" />,
  month: <path d="M4 5h16v15H4zM4 10h16M8 3v4M16 3v4" />,
  holder: <path d="M12 3l9 7-9 11-9-11zM3 10h18" />,
  copyable: <path d="M4 5h16v14H4zM8 12h.01M12 9v6M15 12h1" />,
};
const TINT: Record<BadgeId, string> = { og: 'bg-honey/60', 'first-receipt': 'bg-clover-tint', 'ten-receipts': 'bg-clover-tint', diversified: 'bg-lav/50', talker: 'bg-sky/50', 'green-week': 'bg-mint/60', month: 'bg-peach/50', holder: 'bg-rose/60', copyable: 'bg-cream-deep' };

export function BadgeIcon({ id, size = 22, dim = false, title }: { id: BadgeId; size?: number; dim?: boolean; title?: string }) {
  return (
    <span className={`inline-grid place-items-center rounded-full ${dim ? 'bg-cream-deep opacity-40' : TINT[id]}`} style={{ width: size + 10, height: size + 10 }} title={title}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#4a3b32" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[id]}</svg>
    </span>
  );
}

/** Level ring colours: the avatar's ring says how far a muse has come. */
export const RING = ['ring', 'ring', 'ring-clover', 'ring-honey', 'ring-lav', 'ring-gold'];

export function BadgeRow({ badges, max = 4 }: { badges: Badge[]; max?: number }) {
  const earned = badges.filter((b) => b.earned).slice(0, max);
  if (!earned.length) return <span className="text-micro text-ink-3">no badges yet</span>;
  return <span className="inline-flex gap-1" aria-label={earned.map((b) => b.name).join(', ')}>{earned.map((b) => <BadgeIcon key={b.id} id={b.id} size={14} title={b.name} />)}</span>;
}

export function BadgeShelf({ badges }: { badges: Badge[] }) {
  return (
    <ul className="grid sm:grid-cols-3 gap-3">
      {badges.map((b) => (
        <li key={b.id} className={`receipt rounded-tile border border-ink/10 px-4 py-3 flex items-center gap-3 ${b.earned ? '' : 'opacity-60'}`}>
          <BadgeIcon id={b.id} dim={!b.earned} />
          <span className="min-w-0">
            <span className="block font-extrabold leading-tight">{b.name}</span>
            <span className="block text-micro text-ink-3">{b.earned ? b.how : `${b.how}${b.detail ? ` · ${b.detail}` : ''}`}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
