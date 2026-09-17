import type { Hex } from 'viem';
import { createInterface } from 'node:readline';

function clean(raw: string): string {
  let k = (raw ?? '').trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, '');
  if (k && !k.startsWith('0x')) k = `0x${k}`;
  return k;
}
const valid = (k: string) => /^0x[0-9a-fA-F]{64}$/.test(k);

/** Asks for the key in the terminal (input hidden) so shell quoting never gets in the way. */
async function prompt(name: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const stdout = process.stdout as NodeJS.WriteStream & { muted?: boolean };
  return new Promise((resolve) => {
    stdout.write(`${name} (paste the private key, it stays hidden): `);
    const orig = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
    rl.question('', (ans) => { (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = orig; rl.close(); stdout.write('\n'); resolve(ans); });
  });
}

/** A private key from the env var, or typed in when it is missing or wrong. */
export async function readKey(raw: string | undefined, name = 'DEPLOYER_KEY'): Promise<Hex> {
  let k = clean(raw ?? '');
  for (let tries = 0; !valid(k) && tries < 3; tries++) {
    if (k) console.log(k.includes('...') ? `${name}: that is the placeholder, not a key.` : `${name}: got ${k.length} characters, need 66 (0x + 64 hex).`);
    k = clean(await prompt(name));
  }
  if (!valid(k)) throw new Error(`${name}: still not a valid key`);
  return k as Hex;
}
