/**
 * Compiles with the solc that npm installed (0.8.26, the version the contracts
 * were written against), so a build needs no binary outside package-lock.json.
 * OpenZeppelin comes from node_modules. Output: contracts/out/.
 */
import solc from 'solc';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const NODE_MODULES = resolve(ROOT, '..', 'node_modules');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.sol')) out.push(p);
  }
  return out;
}

const sources: Record<string, { content: string }> = {};
for (const f of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'test'))]) {
  sources[f.replace(ROOT + '/', '')] = { content: readFileSync(f, 'utf8') };
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 10000 },
    evmVersion: 'cancun',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  },
};

const findImport = (path: string) => {
  for (const base of [ROOT, NODE_MODULES]) {
    const p = join(base, path);
    if (existsSync(p)) return { contents: readFileSync(p, 'utf8') };
  }
  return { error: `not found: ${path}` };
};

const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

let fatal = false;
for (const e of out.errors ?? []) {
  if (e.severity === 'error') fatal = true;
  if (e.severity === 'error' || /src\//.test(e.formattedMessage)) console.log(`${e.severity.toUpperCase()}: ${e.formattedMessage}`);
}
if (fatal) process.exit(1);

mkdirSync(join(ROOT, 'out'), { recursive: true });
const artifacts: Record<string, unknown> = {};
for (const [file, contracts] of Object.entries(out.contracts as Record<string, any>)) {
  if (!file.startsWith('src/') && !file.startsWith('test/')) continue;
  for (const [name, c] of Object.entries(contracts as Record<string, any>)) {
    if (!c.evm.bytecode.object) continue;
    artifacts[name] = {
      abi: c.abi,
      bytecode: '0x' + c.evm.bytecode.object,
      deployedSize: c.evm.deployedBytecode.object.length / 2,
    };
    console.log(`${name.padEnd(18)} ${(c.evm.deployedBytecode.object.length / 2).toString().padStart(6)} bytes`);
  }
}
writeFileSync(join(ROOT, 'out', 'artifacts.json'), JSON.stringify(artifacts, null, 2));
console.log(`\nsolc ${solc.version()}`);
