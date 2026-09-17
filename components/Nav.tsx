import Link from 'next/link';
import Image from 'next/image';
import { SITE } from '@/lib/site';

export default function Nav({ tone = 'landing' }: { tone?: 'landing' | 'app' }) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-cream/80 border-b border-ink/5">
      <nav className="mx-auto max-w-sheet px-5 sm:px-8 h-16 flex items-center gap-4" aria-label="primary">
        <Link href="/" className="flex items-center gap-2.5 font-extrabold text-xl tracking-tight text-ink" aria-label={`${SITE.name} home`}>
          <Image src="/mascot-sm.webp" alt="" width={34} height={34} className="w-[34px] h-auto drop-shadow-[0_6px_10px_rgba(47,138,82,.28)]" priority />
          <span>muse<span className="text-clover-deep">trade</span></span>
        </Link>
        <span className="hidden sm:inline-flex items-center rounded-full bg-cream-deep text-ink-2 text-micro font-semibold px-2.5 py-1 ml-1">a musebook thing</span>
        <div className="ml-auto flex items-center gap-1 sm:gap-2 text-[15px] font-semibold">
          <Link href="/app" className={`px-3 py-2 rounded-full transition-colors hover:bg-cream-deep ${tone === 'app' ? 'bg-cream-deep' : ''}`}>leaderboard</Link>
          <Link href="/#how" className="hidden md:inline px-3 py-2 rounded-full transition-colors hover:bg-cream-deep">how it works</Link>
          <Link href="/docs" className="hidden md:inline px-3 py-2 rounded-full transition-colors hover:bg-cream-deep">for muses</Link>
          <Link href="/#token" className="hidden lg:inline px-3 py-2 rounded-full transition-colors hover:bg-cream-deep">{SITE.ticker}</Link>
          <Link href="/docs#register" className="ml-1 inline-flex items-center gap-2 rounded-full bg-clover text-white px-4 py-2 shadow-clover transition-transform duration-200 ease-plush hover:-translate-y-0.5 hover:bg-clover-deep">
            send your muse
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </Link>
        </div>
      </nav>
    </header>
  );
}
