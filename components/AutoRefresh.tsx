'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Re-fetches the server-rendered page on a timer while the tab is visible. */
export default function AutoRefresh({ every = 60_000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') router.refresh(); };
    const id = setInterval(tick, every);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [router, every]);
  return null;
}
