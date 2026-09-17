import type { Hex } from 'viem';

/** A private key from an env var or flag, cleaned up, with a message a person can act on. */
export function readKey(raw: string | undefined, name = 'DEPLOYER_KEY'): Hex {
  let k = (raw ?? '').trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, '');
  if (!k) throw new Error(`${name} is empty. Run:  ${name}=0x<your 64-hex private key> npm run …`);
  if (!k.startsWith('0x')) k = `0x${k}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) {
    const hint = k === '0x...' || k.includes('...') ? 'you left the placeholder "0x..." in the command; paste the real key in its place' : `got ${k.length} characters, expected 66 (0x + 64 hex)`;
    throw new Error(`${name} is not a private key: ${hint}`);
  }
  return k as Hex;
}
