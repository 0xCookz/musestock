'use client';
import { useState } from 'react';

/** The contract address, in full, with a copy button that confirms itself. */
export default function CopyCA({ address }: { address: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(address); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* selection still works */ } };
  return (
    <div className="receipt rounded-tile border border-ink/10 px-4 py-3 flex items-center gap-3 flex-wrap">
      <span className="text-micro uppercase tracking-wide text-ink-3 font-semibold">CA</span>
      <code className="font-mono text-[13px] sm:text-[15px] break-all select-all text-ink">{address}</code>
      <button type="button" onClick={copy} className="ml-auto inline-flex items-center rounded-full bg-clover text-white text-micro font-bold px-3 py-1.5 min-h-[36px] hover:bg-clover-deep" aria-live="polite">{done ? 'copied' : 'copy'}</button>
    </div>
  );
}
