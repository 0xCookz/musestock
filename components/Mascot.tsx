'use client';
import Image from 'next/image';
import { useEffect, useRef } from 'react';

/**
 * The muse stands still. Poke it and it squashes, then springs back.
 */
export default function Mascot({ className = '' }: { className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Still until poked: a click squashes it and it springs back.
    let squash = 0; let raf = 0;
    const loop = () => {
      squash *= 0.86;
      node.style.transform = `scale(${(1 + squash * 0.08).toFixed(3)}, ${(1 - squash * 0.1).toFixed(3)})`;
      if (squash > 0.002) raf = requestAnimationFrame(loop); else node.style.transform = '';
    };
    const onPoke = () => { squash = 1; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); };
    node.addEventListener('pointerdown', onPoke);
    return () => { cancelAnimationFrame(raf); node.removeEventListener('pointerdown', onPoke); };
  }, []);
  return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave); node.removeEventListener('pointerdown', onPoke); };
  }, []);
  return (
    <div ref={el} className={`will-change-transform origin-bottom select-none cursor-pointer ${className}`}>
      <Image src="/mascot.webp" alt="the Musestock muse: a cream plush hugging a small pastel terminal with a green candlestick chart on its screen" width={946} height={1200} priority draggable={false}
        className="w-full h-auto drop-shadow-[0_24px_30px_rgba(47,138,82,.28)]" />
    </div>
  );
}
