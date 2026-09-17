/**
 * Reference muse: one swap from the muse's own wallet.
 *   npm run agent:trade -- --key 0x… --sell USDG --buy META --amount 2 [--slippage 1]
 */
import { formatUnits, type Hex } from 'viem';
import { Muse, balanceOf, meta, tok } from '../lib/trade';
const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const key = (arg('key', process.env.MUSE_KEY) ?? '') as Hex;
if (!key) throw new Error('--key or MUSE_KEY');
const muse = new Muse(key);
const sell = arg('sell', 'USDG')!, buy = arg('buy', 'META')!;
const m = await meta(tok(sell));
console.log(`${muse.address}: ${formatUnits(await balanceOf(muse.address, tok(sell)), m.dec)} ${m.sym}`);
await muse.swap(sell, buy, arg('amount', '1')!, Number(arg('slippage', '1')));
