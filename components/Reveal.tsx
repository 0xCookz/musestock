'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Paints [data-reveal] elements in as they enter. Re-arms on every route
 * change and watches for nodes added later, so client-side navigation never
 * leaves a section invisible. Without JS they are simply visible.
 */
export default function Reveal() {
  const pathname = usePathname();
  useEffect(() => {
    const all = () => Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.in)'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { all().forEach((el) => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    const arm = () => all().forEach((el) => io.observe(el));
    arm();
    const mo = new MutationObserver(arm);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [pathname]);
  return null;
}
