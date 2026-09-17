/**
 * Open a copy-vault for each resident that holds the stake and has none yet.
 *   npm run vault:open            # all muses in .data/muses.local.txt
 *   npm run vault:open -- --only nimbus
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { formatUnits, parseAbi, type Hex } from 'viem';
import { client } from '../lib/chain';
import { SITE } from '../lib/site';
import { Muse } from '../lib/trade';
import { VAULT_FACTORY, factoryAbi } from '../lib/vault';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const only = arg('only');
const factory = (arg('factory', VAULT_FACTORY || process.env.NEXT_PUBLIC_VAULT_FACTORY) ?? '') as `0x${string}`;
if (!factory) throw new Error('set NEXT_PUBLIC_VAULT_FACTORY');
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)']);
const token = SITE.token.address as `0x${string}`;
const keys: Record<string, Hex> = {};
for (const line of (await fs.readFile(path.join(process.cwd(), '.data', 'muses.local.txt'), 'utf8')).split('\n')) { const m = line.match(/^(\w+):\s*MUSE_KEY=(0x[0-9a-fA-F]{64})/); if (m) keys[m[1]] = m[2] as Hex; }
const need = await client.readContract({ address: factory, abi: factoryAbi, functionName: 'stakeRequired' });
for (const [name, key] of Object.entries(keys)) {
  if (only && only !== name) continue;
  const muse = new Muse(key, (s) => console.log(`${name}: ${s}`));
  const existing = await client.readContract({ address: factory, abi: factoryAbi, functionName: 'vaultOf', args: [muse.address] });
  if (!/^0x0+$/.test(existing)) { muse.log(`already has vault ${existing}`); continue; }
  const bal = await client.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [muse.address] });
  if (bal < need) { muse.log(`holds ${formatUnits(bal, 18)} MUSESTOCK, needs ${formatUnits(need, 18)} — send the stake to ${muse.address}`); continue; }
  const allowance = await client.readContract({ address: token, abi: erc20, functionName: 'allowance', args: [muse.address, factory] });
  if (allowance < need) { const h = await muse.wallet.writeContract({ address: token, abi: erc20, functionName: 'approve', args: [factory, need] }); await client.waitForTransactionReceipt({ hash: h }); muse.log(`approved stake ${h}`); }
  const h = await muse.wallet.writeContract({ address: factory, abi: factoryAbi, functionName: 'openVault', args: [`${name} vault`, `v${name.toUpperCase()}`] });
  const rc = await client.waitForTransactionReceipt({ hash: h });
  const vault = await client.readContract({ address: factory, abi: factoryAbi, functionName: 'vaultOf', args: [muse.address] });
  muse.log(`${rc.status} vault ${vault} https://robinhoodchain.blockscout.com/tx/${h}`);
}
