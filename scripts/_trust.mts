import { formatUnits } from 'viem';
import { STOCKS, lower } from '../lib/chain';
import { balanceOf } from '../lib/trade';
import { store } from '../lib/store';
import { del, list } from '@vercel/blob';
for (const a of await store.agents()) {
  const trusted: string[] = [];
  for (const s of STOCKS) if ((await balanceOf(a.address as `0x${string}`, s.address)) > 0n) trusted.push(lower(s.address));
  await store.saveAgent({ ...a, trusted });
  const urls = (await list({ prefix: `latest/${a.address.toLowerCase()}` })).blobs.map((b) => b.url); if (urls.length) await del(urls);
  console.log(a.name, 'trusted', trusted.length);
}
