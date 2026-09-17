/**
 * Owner-only knobs on the factory. Needs DEPLOYER_KEY (the factory owner).
 *   DEPLOYER_KEY=0x… npm run vault:admin -- --stake 0          # MUSESTOCK required to open a vault
 *   DEPLOYER_KEY=0x… npm run vault:admin -- --cap 1000         # USDG cap per vault
 */
import { createWalletClient, formatUnits, parseAbi, parseUnits, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { client, robinhood, transport } from '../lib/chain';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { VAULT_FACTORY } from '../lib/vault';
const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const deployed = (() => { try { return JSON.parse(require('node:fs').readFileSync('contracts/deployments/4663.json', 'utf8')).factory as string; } catch { return ''; } })();
const factory = (arg('factory', VAULT_FACTORY || process.env.NEXT_PUBLIC_VAULT_FACTORY || deployed) ?? '') as `0x${string}`;
const key = (process.env.DEPLOYER_KEY ?? '') as Hex; if (!key || !factory) throw new Error('DEPLOYER_KEY and NEXT_PUBLIC_VAULT_FACTORY');
const abi = parseAbi(['function router() view returns (address)', 'function permit2() view returns (address)', 'function treasury() view returns (address)', 'function stakeRequired() view returns (uint256)', 'function vaultCap() view returns (uint256)', 'function maxSlippageBps() view returns (uint256)', 'function setParams(address,address,address,uint256,uint256,uint256)']);
const cur = await Promise.all((['router', 'permit2', 'treasury', 'stakeRequired', 'vaultCap', 'maxSlippageBps'] as const).map((fn) => client.readContract({ address: factory, abi, functionName: fn })));
const [router, permit2, treasury, stake, cap, slip] = cur as [`0x${string}`, `0x${string}`, `0x${string}`, bigint, bigint, bigint];
const nextStake = arg('stake') ? parseUnits(arg('stake')!, 18) : stake;
const nextCap = arg('cap') ? parseUnits(arg('cap')!, 6) : cap;
const nextTreasury = (arg('treasury') ?? treasury) as `0x${string}`;
console.log(`stake ${formatUnits(stake, 18)} → ${formatUnits(nextStake, 18)} · cap ${formatUnits(cap, 6)} → ${formatUnits(nextCap, 6)} · treasury ${treasury} → ${nextTreasury}`);
const wallet = createWalletClient({ account: privateKeyToAccount(key), chain: robinhood, transport: transport() });
const h = await wallet.writeContract({ address: factory, abi, functionName: 'setParams', args: [router, permit2, nextTreasury, nextStake, nextCap, slip] });
console.log((await client.waitForTransactionReceipt({ hash: h })).status, `https://robinhoodchain.blockscout.com/tx/${h}`);
