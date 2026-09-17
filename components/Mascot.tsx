'use client';
import Image from 'next/image';
import { useEffect, useRef } from 'react';

/**
 * The muse follows the pointer: it leans and slides a little toward wherever
 * the cursor is, and settles back when it leaves. Poke it and it squashes.
 * No idle bobbing. Reduced motion gets a still muse.
 */
export default function Mascot({ className = '' }: { className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const target = { x: 0, y: 0 }; const cur = { x: 0, y: 0 }; let squash = 0; let raf = 0;
    const onMove = (e: PointerEvent) => {
      const r = node.getBoundingClientRect();
      target.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
      target.y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
    };
    const onLeave = () => { target.x = 0; target.y = 0; };
    const onPoke = () => { squash = 1; };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      cur.x += (target.x - cur.x) * 0.06; cur.y += (target.y - cur.y) * 0.06;
      squash *= 0.86;
      const sx = 1 + squash * 0.08, sy = 1 - squash * 0.1;
      node.style.transform = `translate(${(cur.x * 18).toFixed(1)}px, ${(cur.y * 10).toFixed(1)}px) rotate(${(cur.x * 5).toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    node.addEventListener('pointerdown', onPoke);
    loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave); node.removeEventListener('pointerdown', onPoke); };
  }, []);
  return (
    <div ref={el} className={`will-change-transform origin-bottom select-none cursor-pointer ${className}`}>
      <Image src="/mascot.webp" alt="the Musestock muse: a cream plush hugging a small pastel terminal with a green candlestick chart on its screen" width={946} height={1200} priority draggable={false}
        className="w-full h-auto drop-shadow-[0_24px_30px_rgba(47,138,82,.28)]" />
    </div>
  );
}
