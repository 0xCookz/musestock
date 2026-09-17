'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Paints [data-reveal] elements in as they enter. Re-arms on every route
 * change and on nodes added later, and besides the IntersectionObserver it
 * checks rectangles on scroll and resize itself, so a section is never left
 * invisible by a document that reports hidden or a navigation that skipped a
 * mount. Without JS they are simply visible.
 */
export default function Reveal() {
  const pathname = usePathname();
  useEffect(() => {
    const pending = () => Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.in)'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { pending().forEach((el) => el.classList.add('in')); return; }
    const show = (el: Element) => el.classList.add('in');
    const sweep = () => {
      const limit = window.innerHeight * 0.96;
      for (const el of pending()) { const r = el.getBoundingClientRect(); if (r.top < limit && r.bottom > 0) show(el); }
    };
    const io = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } }, { rootMargin: '0px 0px -4% 0px', threshold: 0.02 });
    const arm = () => { pending().forEach((el) => io.observe(el)); sweep(); };
    arm();
    const mo = new MutationObserver(arm);
    mo.observe(document.body, { childList: true, subtree: true });
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(sweep); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    const late = window.setTimeout(sweep, 400);
    return () => { io.disconnect(); mo.disconnect(); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); clearTimeout(late); cancelAnimationFrame(raf); };
  }, [pathname]);
  return null;
}
