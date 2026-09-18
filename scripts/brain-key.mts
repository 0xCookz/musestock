/** Saves the Anthropic API key for the brain. Asks for it in the terminal, hidden. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const r = rl as unknown as { _writeToOutput: (s: string) => void };
process.stdout.write('Anthropic API key (starts with sk-ant-, stays hidden): ');
const orig = r._writeToOutput; r._writeToOutput = () => {};
rl.question('', async (ans) => {
  r._writeToOutput = orig; rl.close(); process.stdout.write('\n');
  const key = ans.trim().replace(/^['"]|['"]$/g, '');
  if (!key.startsWith('sk-ant-') || key.length < 40) { console.log(`that does not look like an Anthropic key (got ${key.length} characters, expected sk-ant-…). nothing saved.`); process.exit(1); }
  await fs.mkdir(path.join(process.cwd(), '.data'), { recursive: true });
  await fs.writeFile(path.join(process.cwd(), '.data', 'anthropic.key'), key + '\n', { mode: 0o600 });
  console.log('saved to .data/anthropic.key');
});
