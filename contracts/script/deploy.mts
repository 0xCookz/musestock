/**
 * Deploys the factory to Robinhood Chain and registers a valuation route for
 * every stock that has a pool. Needs DEPLOYER_KEY (funded with a little ETH).
 *
 *   DEPLOYER_KEY=0x… npm run deploy:vaults -- [--stake 1000000] [--cap 500] [--treasury 0x…]
 *
 * Writes contracts/deployments/4663.json and prints the env line for Vercel.
 */
import { createWalletClient, parseUnits, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readKey } from '../../lib/key';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { client, PERMIT2, POOL_MANAGER, robinhood, transport, UNIVERSAL_ROUTER, USDG, WETH } from '../../lib/chain';
import { SITE } from '../../lib/site';
import { findRoutes } from './routes';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const key = await readKey(process.env.DEPLOYER_KEY);
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ account, chain: robinhood, transport: transport() });
const ROOT = resolve(import.meta.dirname, '..');
const art = JSON.parse(readFileSync(join(ROOT, 'out', 'artifacts.json'), 'utf8')) as Record<string, { abi: any; bytecode: Hex }>;
const treasury = (arg('treasury', account.address) as Address);
const stake = parseUnits(arg('stake', '1000000')!, 18);
const cap = parseUnits(arg('cap', '500')!, 6);

console.log(`deployer ${account.address}, treasury ${treasury}, stake ${arg('stake', '1000000')} MUSESTOCK, cap ${arg('cap', '500')} USDG`);
const hash = await wallet.deployContract({ abi: art.MuseVaultFactory.abi, bytecode: art.MuseVaultFactory.bytecode, args: [USDG, WETH, SITE.token.address, POOL_MANAGER, UNIVERSAL_ROUTER, PERMIT2, treasury, stake] });
const rc = await client.waitForTransactionReceipt({ hash });
const factory = rc.contractAddress!;
console.log(`factory ${factory} (${hash})`);
const routes = await findRoutes();
for (const r of routes) {
  if (Math.abs(r.onchain / r.dex - 1) > 0.05) { console.log(`${r.symbol}: contract price ${r.onchain} vs dex ${r.dex}, skipped`); continue; }
  const h = await wallet.writeContract({ address: factory, abi: art.MuseVaultFactory.abi, functionName: 'setRoute', args: [r.token, r.kind, r.poolId, r.pool, r.hopPool] });
  await client.waitForTransactionReceipt({ hash: h });
  console.log(`route ${r.symbol} kind ${r.kind} ${h}`);
}
mkdirSync(join(ROOT, 'deployments'), { recursive: true });
writeFileSync(join(ROOT, 'deployments', '4663.json'), JSON.stringify({ factory, treasury, stake: stake.toString(), cap: cap.toString(), routes, deployedAt: Date.now(), tx: hash }, null, 1));
console.log(`\nadd to Vercel: NEXT_PUBLIC_VAULT_FACTORY=${factory}`);
