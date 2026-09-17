'use client';

import { useEffect, useRef } from 'react';
import wordmark from '@/lib/wordmark.json';

/**
 * MUSESTOCK in 2D: Baloo 2 outlines pulled from the TTF at build time, MUSE
 * in ink and STOCK in clover, with a soft highlight and a shadow so the
 * letters read as puffy vinyl like the share card. Motion is small: each
 * letter breathes on its own beat and the whole word leans a few degrees
 * toward the pointer. Reduced motion gets a still word.
 */
type Letter = { char: string; d: string; advance: number };
const LETTERS = wordmark.letters as Letter[];
const TRACKING = -0.005;
const CAP = wordmark.capHeight;
const OURS = 4; // where STOCK starts
const total = LETTERS.reduce((w, l) => w + l.advance + TRACKING, -TRACKING);

export default function Wordmark({ className = '' }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0; const cur = { x: 0, y: 0 }; const target = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.y = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / Math.max(r.width, 1))) * 5;
      target.x = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / Math.max(r.height, 1))) * -4;
    };
    const onLeave = () => { target.x = 0; target.y = 0; };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      cur.x += (target.x - cur.x) * 0.05; cur.y += (target.y - cur.y) * 0.05;
      el.style.transform = `perspective(900px) rotateX(${cur.x.toFixed(2)}deg) rotateY(${cur.y.toFixed(2)}deg)`;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave); };
  }, []);

  const pad = 0.1;
  let x = 0;
  const placed = LETTERS.map((l) => { const at = x; x += l.advance + TRACKING; return { ...l, x: at }; });
  return (
    <div ref={host} className={`will-change-transform ${className}`} style={{ transformStyle: 'preserve-3d' }}>
      <svg viewBox={`${-pad} ${-(CAP + pad * 1.6)} ${total + pad * 2} ${CAP + pad * 3}`} className="w-full h-auto overflow-visible" role="img" aria-label="MUSESTOCK">
        <defs>
          <linearGradient id="wm-gloss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0.08" />
            <stop offset="1" stopColor="#000" stopOpacity="0.12" />
          </linearGradient>
          <filter id="wm-shadow" x="-10%" y="-20%" width="120%" height="160%">
            <feDropShadow dx="0" dy="0.035" stdDeviation="0.02" floodColor="#4a3b32" floodOpacity="0.28" />
          </filter>
        </defs>
        {placed.map((l, i) => (
          <g key={i} className="wm-letter" style={{ animationDelay: `${(i * 0.35).toFixed(2)}s` }} filter="url(#wm-shadow)">
            <g transform={`translate(${l.x} 0)`}>
              <path d={l.d} fill={i >= OURS ? '#2f8a52' : '#4a3b32'} />
              <path d={l.d} fill="url(#wm-gloss)" style={{ mixBlendMode: 'soft-light' }} />
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
