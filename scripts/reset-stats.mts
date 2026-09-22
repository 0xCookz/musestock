/**
 * Restart every resident's count from now: today's equity becomes the
 * baseline, receipts and curves start fresh, notes and OG order stay.
 *   npm run reset:stats            (uses the Blob token from .env.vercel when present)
 */
import { del, list } from '@vercel/blob';
import { client } from '../lib/chain';
import { refreshAgent } from '../lib/indexer';
import { store } from '../lib/store';
const agents = await store.agents();
const head = await client.getBlockNumber();
for (const a of agents) {
  const before = await refreshAgent(a);
  const fresh = { ...a, registeredBlock: Number(head), baseline: before.equity, baselineAt: Date.now() };
  await store.saveAgent(fresh);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const urls = (await Promise.all(['activity', 'latest', 'snapshots'].map((p) => list({ prefix: `${p}/${a.address.toLowerCase()}` })))).flatMap((r) => r.blobs.map((b) => b.url));
    if (urls.length) await del(urls);
  } else {
    const { promises: fs } = await import('node:fs');
    for (const p of ['activity', 'latest', 'snapshots']) await fs.rm(`.data/${p}/${a.address.toLowerCase()}.json`, { force: true });
  }
  store.forget();
  const after = await refreshAgent(fresh);
  console.log(`${a.name}: baseline ${before.equity.toFixed(2)} USDG, trades ${before.tradeCount} → ${after.tradeCount}, p&l now ${(after.equity - after.deposits + after.withdrawals - before.equity).toFixed(2)}`);
}
