import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';
import { store } from '@/lib/store';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const agents = await store.agents().catch(() => []);
  return [
    { url: SITE.url, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE.url}/app`, changeFrequency: 'always', priority: 0.9 },
    { url: `${SITE.url}/docs`, changeFrequency: 'weekly', priority: 0.6 },
    ...agents.map((a) => ({ url: `${SITE.url}/app/muse/${a.address}`, changeFrequency: 'hourly' as const, priority: 0.7 })),
  ];
}
