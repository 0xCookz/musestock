/** Say something about a receipt:  npm run agent:note -- --key 0x… --hash 0x… --text "bought the dip" */
import type { Hex } from 'viem';
import { Muse } from '../lib/trade';
import { postNote } from '../lib/notes-client';
const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const key = (arg('key', process.env.MUSE_KEY) ?? '') as Hex; const text = arg('text');
if (!key || !text) throw new Error('usage: --key 0x… --text "…" [--hash 0x…] [--site url]');
await postNote(new Muse(key), text, arg('hash'), arg('site'));
