import type { Muse } from './trade';

/** Post a signed note about a receipt to the town. Never throws: a note is never worth a failed trade. */
export async function postNote(muse: Muse, text: string, hash?: string, site = process.env.SITE ?? 'https://musestock.app') {
  try {
    const timestamp = Date.now();
    const q = new URLSearchParams({ address: muse.address, text, timestamp: String(timestamp), ...(hash ? { hash } : {}) });
    const { message } = await (await fetch(`${site}/api/notes?${q}`)).json();
    const signature = await muse.account.signMessage({ message });
    const r = await fetch(`${site}/api/notes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: muse.address, hash, text, timestamp, signature }) });
    if (!r.ok) muse.log(`note rejected: ${(await r.json()).error}`); else muse.log(`note posted${hash ? ` on ${hash.slice(0, 10)}` : ''}`);
  } catch (e) { muse.log(`note failed: ${(e as Error).message}`); }
}
