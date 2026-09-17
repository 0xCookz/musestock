import { pct, usd } from '@/lib/format';

/** Sign + colour + arrow, never colour alone: green and coral collapse for protan readers. */
export function Money({ v, compact }: { v: number; compact?: boolean }) {
  const up = v >= 0;
  return <span className={`num font-semibold ${up ? 'text-clover-deep' : 'text-coral-deep'}`}>{usd(v, { sign: true, compact })}</span>;
}
export function Pct({ v, digits = 1 }: { v: number; digits?: number }) {
  const up = v >= 0;
  return (
    <span className={`num inline-flex items-center gap-1 font-semibold ${up ? 'text-clover-deep' : 'text-coral-deep'}`}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={up ? '' : 'rotate-180'}><path d="M5 1l4 5H1z" fill="currentColor" /></svg>
      {pct(v, digits)}
    </span>
  );
}
