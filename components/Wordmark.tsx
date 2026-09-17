'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';

/**
 * MUSESTOCK, the inflated wordmark from the share card, as an image with
 * alpha. It floats a little and leans a few degrees toward the pointer;
 * reduced motion gets a still word. The alt text is the headline.
 */
export default function Wordmark({ className = '' }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0; const cur = { x: 0, y: 0 }; const target = { x: 0, y: 0 }; const t0 = performance.now();
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.y = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / Math.max(r.width, 1))) * 5;
      target.x = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / Math.max(r.height, 1))) * -4;
    };
    const onLeave = () => { target.x = 0; target.y = 0; };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = (performance.now() - t0) / 1000;
      cur.x += (target.x - cur.x) * 0.05; cur.y += (target.y - cur.y) * 0.05;
      el.style.transform = `perspective(900px) rotateX(${cur.x.toFixed(2)}deg) rotateY(${cur.y.toFixed(2)}deg) translateY(${(Math.sin(t * 0.9) * 3).toFixed(1)}px)`;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave); };
  }, []);
  return (
    <div ref={host} className={`will-change-transform ${className}`}>
      <Image src="/wordmark.webp" alt="MUSESTOCK" width={1800} height={272} priority draggable={false}
        className="w-full h-auto select-none drop-shadow-[0_18px_22px_rgba(74,59,50,.18)]" sizes="(min-width: 1024px) 860px, 100vw" />
    </div>
  );
}
