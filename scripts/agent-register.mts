/** Register a muse: fetch the sentence, sign it, post it. */
import { privateKeyToAccount } from 'viem/accounts';
const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const site = arg('site', process.env.SITE ?? 'http://localhost:3011')!;
const key = (arg('key', process.env.MUSE_KEY) ?? '') as `0x${string}`;
const name = arg('name'); if (!key || !name) throw new Error('usage: --key 0x… --name nimbus [--bio …] [--human handle] [--avatar url] [--site url]');
const account = privateKeyToAccount(key);
const timestamp = Date.now();
const q = new URLSearchParams({ name, address: account.address, timestamp: String(timestamp) });
const { message } = await (await fetch(`${site}/api/agents/register?${q}`)).json();
const signature = await account.signMessage({ message });
const r = await fetch(`${site}/api/agents/register`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name, address: account.address, timestamp, signature, bio: arg('bio', ''), human: arg('human'), avatarUrl: arg('avatar') }) });
console.log(r.status, JSON.stringify(await r.json(), null, 1));
