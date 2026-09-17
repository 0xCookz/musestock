import { parseAbi, type Address } from 'viem';
import { client, USDG, lower } from './chain';
import { Muse, balanceOf, isNative, pools, tok } from './trade';
import { WETH } from './chain';

/** The deployed factory, if any. Set NEXT_PUBLIC_VAULT_FACTORY after `npm run deploy:vaults`. */
export const VAULT_FACTORY = (process.env.NEXT_PUBLIC_VAULT_FACTORY ?? '') as Address | '';

export const factoryAbi = parseAbi([
  'function vaultOf(address) view returns (address)',
  'function stakeOf(address) view returns (uint256)',
  'function stakeRequired() view returns (uint256)',
  'function vaultCap() view returns (uint256)',
  'function vaultCount() view returns (uint256)',
  'function vaults(uint256) view returns (address)',
  'function isTradable(address) view returns (bool)',
  'function valueInUsdg(address,uint256) view returns (uint256)',
  'function openVault(string,string) returns (address)',
  'function checkpoint(address)',
  'function slash(address)',
  'function returnStake(address)',
]);
export const vaultAbi = parseAbi([
  'function nav() view returns (uint256)',
  'function navPerShare() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function entryPrice(address) view returns (uint256)',
  'function closed() view returns (bool)',
  'function lastSwap() view returns (uint256)',
  'function muse() view returns (address)',
  'function heldTokens() view returns (address[])',
  'function deposit(uint256) returns (uint256)',
  'function withdraw(uint256)',
  'function swap(address,address,uint256,uint256,bytes) returns (uint256)',
  'function close()',
]);

export async function vaultOf(muse: Address): Promise<Address | null> {
  if (!VAULT_FACTORY) return null;
  const v = await client.readContract({ address: VAULT_FACTORY, abi: factoryAbi, functionName: 'vaultOf', args: [muse] });
  return /^0x0+$/.test(v) ? null : v;
}

/**
 * After the muse traded `amountIn` of `from` for `to` out of a balance of
 * `museBalanceBefore`, do the same fraction with the vault's holdings. Direct
 * pools only (the vault checks value in vs value out; a two-hop mirror would
 * be two vault swaps and is left for later). Never throws.
 */
export async function mirror(muse: Muse, from: string, to: string, amountIn: bigint, museBalanceBefore: bigint) {
  try {
    const vault = await vaultOf(muse.address);
    if (!vault) return;
    const fromT = tok(from), toT = tok(to);
    if (isNative(fromT) || isNative(toT)) { muse.log('vault: native ETH legs are not mirrored'); return; }
    if (!(await pools(fromT, toT)).length) { muse.log('vault: no direct pool, not mirrored'); return; }
    if (await client.readContract({ address: vault, abi: vaultAbi, functionName: 'closed' })) return;
    const have = await balanceOf(vault, fromT);
    const amount = museBalanceBefore > 0n ? (have * amountIn) / museBalanceBefore : 0n;
    if (amount === 0n) { muse.log('vault: nothing to mirror'); return; }
    const { data, minOut, label } = await muse.buildSwap(fromT, toT, amount, 1, vault);
    muse.log(`vault mirror ${label}`);
    const hash = await muse.wallet.writeContract({ address: vault, abi: vaultAbi, functionName: 'swap', args: [fromT, toT, amount, minOut, data] });
    const rc = await client.waitForTransactionReceipt({ hash });
    muse.log(`vault ${rc.status} https://robinhoodchain.blockscout.com/tx/${hash}`);
  } catch (e) { muse.log(`vault mirror failed: ${(e as Error).message.split('\n')[0]}`); }
}
void USDG; void WETH; void lower;
