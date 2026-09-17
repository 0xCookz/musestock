/**
 * Copy-vault tests on a real EVM in process (@ethereumjs/vm, Cancun).
 * Pools and the router are mocks with settable prices; the vault and factory
 * are the real bytecode that ships. Time moves through the block timestamp.
 */
import { createVM, type VM } from '@ethereumjs/vm';
import { createBlock } from '@ethereumjs/block';
import { Common, Mainnet, Hardfork } from '@ethereumjs/common';
import { Address, hexToBytes, bytesToHex, createAddressFromString, Account } from '@ethereumjs/util';
import { encodeFunctionData, decodeFunctionResult, encodeAbiParameters, keccak256, toHex, type Abi, type Hex } from 'viem';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const art = JSON.parse(readFileSync(join(ROOT, 'out', 'artifacts.json'), 'utf8')) as Record<string, { abi: Abi; bytecode: Hex }>;
const A = (n: number) => createAddressFromString(`0x${n.toString(16).padStart(40, '0')}`);
const DEPLOYER = A(0xa1), ALICE = A(0xa2), BOB = A(0xa3), MUSE = A(0xb1), MUSE2 = A(0xb2), TREASURY = A(0xc0), RANDO = A(0xd0);
const GAS = 60_000_000n; const ONE = 10n ** 18n; const USD = 10n ** 6n;
let vm: VM; let common: Common; let now = 1_800_000_000n; let failures = 0; let checks = 0;
const ok = (label: string, cond: boolean, detail = '') => { checks++; console.log(`  ${cond ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'} ${label}${detail ? '  ' + detail : ''}`); if (!cond) failures++; };
const block = () => createBlock({ header: { timestamp: now, gasLimit: GAS, number: 1n } }, { common });
async function raw(from: Address, to: Address | undefined, data: Hex, value = 0n) {
  const res = await vm.evm.runCall({ caller: from, origin: from, to, data: hexToBytes(data), gasLimit: GAS, value, block: block() });
  if (res.execResult.exceptionError) throw new Error(`${res.execResult.exceptionError.error} ${bytesToHex(res.execResult.returnValue).slice(0, 138)}`);
  return res;
}
async function deploy(name: string, args: readonly unknown[] = []) {
  const a = art[name]; const ctor = a.abi.find((x: any) => x.type === 'constructor') as any;
  const encoded = ctor && ctor.inputs.length ? encodeAbiParameters(ctor.inputs, args as any).slice(2) : '';
  const res = await raw(DEPLOYER, undefined, (a.bytecode + encoded) as Hex);
  const acct = await vm.stateManager.getAccount(DEPLOYER); await vm.stateManager.putAccount(DEPLOYER, new Account(acct!.nonce + 1n, acct!.balance));
  return res.createdAddress!;
}
async function send(from: Address, to: Address, name: string, fn: string, args: unknown[] = []) {
  const data = encodeFunctionData({ abi: art[name].abi, functionName: fn, args: args as any });
  const res = await raw(from, to, data);
  const rv = bytesToHex(res.execResult.returnValue);
  return rv === '0x' ? undefined : decodeFunctionResult({ abi: art[name].abi, functionName: fn, data: rv });
}
const read = (to: Address, name: string, fn: string, args: unknown[] = []) => send(DEPLOYER, to, name, fn, args);
const selector = (sig: string) => keccak256(toHex(new TextEncoder().encode(sig))).slice(0, 10);
async function reverts(f: () => Promise<unknown>, sig?: string) { try { await f(); return false; } catch (e) { return sig ? String((e as Error).message).includes(selector(sig).slice(2)) : true; } }
const hex = (a: Address) => a.toString() as Hex;
/** sqrtPriceX96 for "usdgPerToken" dollars per whole token, given which side is currency0. */
function sqrtP(usdgPerToken: number, tokenIs0: boolean, tokenDec = 18) {
  const rawP = tokenIs0 ? (usdgPerToken * 1e6) / 10 ** tokenDec : 10 ** tokenDec / (usdgPerToken * 1e6); // raw1/raw0
  return BigInt(Math.round(Math.sqrt(rawP) * 2 ** 96));
}
const bal = async (token: Address, who: Address) => (await read(token, 'MockERC20', 'balanceOf', [hex(who)])) as bigint;
const swapData = (tokenIn: Address, tokenOut: Address, amountIn: bigint) => encodeFunctionData({ abi: art.MockRouter.abi, functionName: 'execute', args: ['0x10', [encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], [hex(tokenIn), hex(tokenOut), amountIn])], 0n] });

async function main() {
  common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });
  vm = await createVM({ common });
  for (const a of [DEPLOYER, ALICE, BOB, MUSE, MUSE2, TREASURY, RANDO]) await vm.stateManager.putAccount(a, new Account(0n, 100n * ONE));

  console.log('\n— setup');
  const usdg = await deploy('MockERC20', ['Global Dollar', 'USDG', 6]);
  const weth = await deploy('MockERC20', ['Wrapped Ether', 'WETH', 18]);
  const stock = await deploy('MockERC20', ['Meta • Robinhood Token', 'META', 18]);
  const muse = await deploy('MockERC20', ['MuseStock', 'MUSESTOCK', 18]);
  const pm = await deploy('MockPoolManager');
  const router = await deploy('MockRouter');
  const STAKE = 1000n * ONE;
  const factory = await deploy('MuseVaultFactory', [hex(usdg), hex(weth), hex(muse), hex(pm), hex(router), '0x0000000000000000000000000000000000000000', hex(TREASURY), STAKE]);
  const stockIs0 = BigInt(hex(stock)) < BigInt(hex(usdg));
  const poolId = keccak256(toHex(new TextEncoder().encode('META/USDG'))) as Hex;
  await send(DEPLOYER, factory, 'MuseVaultFactory', 'setRoute', [hex(stock), 1, poolId, '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000']);
  await send(DEPLOYER, pm, 'MockPoolManager', 'set', [poolId, sqrtP(100, stockIs0)]);
  const v = (await read(factory, 'MuseVaultFactory', 'valueInUsdg', [hex(stock), ONE])) as bigint;
  ok('valuer: 1 META at $100 → 100 USDG', v > 99_990_000n && v < 100_010_000n, `${v}`);
  // liquidity for the mock router
  await send(DEPLOYER, stock, 'MockERC20', 'mint', [hex(router), 1000n * ONE]);
  await send(DEPLOYER, usdg, 'MockERC20', 'mint', [hex(router), 100_000n * USD]);

  console.log('\n— open a vault against a stake');
  await send(DEPLOYER, muse, 'MockERC20', 'mint', [hex(MUSE), STAKE]);
  ok('cannot open without approving the stake', await reverts(() => send(MUSE, factory, 'MuseVaultFactory', 'openVault', ['nimbus vault', 'vNIMBUS'])));
  await send(MUSE, muse, 'MockERC20', 'approve', [hex(factory), STAKE]);
  await send(MUSE, factory, 'MuseVaultFactory', 'openVault', ['nimbus vault', 'vNIMBUS']);
  const vault = createAddressFromString((await read(factory, 'MuseVaultFactory', 'vaultOf', [hex(MUSE)])) as string);
  ok('vault registered, stake locked', (await read(factory, 'MuseVaultFactory', 'stakeOf', [hex(vault)])) === STAKE);
  ok('one vault per muse', await reverts(() => send(MUSE, factory, 'MuseVaultFactory', 'openVault', ['x', 'x']), 'AlreadyHasVault()'));

  console.log('\n— deposit, mirror, revalue');
  await send(DEPLOYER, usdg, 'MockERC20', 'mint', [hex(ALICE), 100n * USD]);
  await send(ALICE, usdg, 'MockERC20', 'approve', [hex(vault), 100n * USD]);
  await send(ALICE, vault, 'MuseVault', 'deposit', [100n * USD]);
  ok('first deposit: 1 share per USDG', (await read(vault, 'MuseVault', 'balanceOf', [hex(ALICE)])) === 100n * USD);
  ok('cap: a deposit past 500 USDG is refused', await reverts(async () => { await send(DEPLOYER, usdg, 'MockERC20', 'mint', [hex(BOB), 1000n * USD]); await send(BOB, usdg, 'MockERC20', 'approve', [hex(vault), 1000n * USD]); await send(BOB, vault, 'MuseVault', 'deposit', [500n * USD]); }, 'CapReached()'));
  await send(DEPLOYER, router, 'MockRouter', 'setRate', [10n ** 10n, 1n]); // 100 USDG (1e8 raw) → 1 META (1e18)
  ok('only the muse can swap', await reverts(() => send(RANDO, vault, 'MuseVault', 'swap', [hex(usdg), hex(stock), 50n * USD, 0n, swapData(usdg, stock, 50n * USD)]), 'NotMuse()'));
  ok('only tradable tokens', await reverts(() => send(MUSE, vault, 'MuseVault', 'swap', [hex(usdg), hex(weth), 50n * USD, 0n, swapData(usdg, weth, 50n * USD)])));
  ok('calldata must be execute()', await reverts(() => send(MUSE, vault, 'MuseVault', 'swap', [hex(usdg), hex(stock), 50n * USD, 0n, '0xdeadbeef']), 'BadCalldata()'));
  await send(MUSE, vault, 'MuseVault', 'swap', [hex(usdg), hex(stock), 50n * USD, ONE / 2n, swapData(usdg, stock, 50n * USD)]);
  ok('vault holds 50 USDG + 0.5 META', (await bal(usdg, vault)) === 50n * USD && (await bal(stock, vault)) === ONE / 2n);
  let nav = (await read(vault, 'MuseVault', 'nav')) as bigint;
  ok('nav still 100 USDG after a fair swap', nav > 99_990_000n && nav <= 100_000_000n, `${nav}`);
  await send(DEPLOYER, router, 'MockRouter', 'setRate', [5n * 10n ** 9n, 1n]); // router now fills at half value
  ok('a swap that loses >3% of value is refused', await reverts(() => send(MUSE, vault, 'MuseVault', 'swap', [hex(usdg), hex(stock), 10n * USD, 0n, swapData(usdg, stock, 10n * USD)]), 'TooMuchSlippage(uint256,uint256)'));
  await send(DEPLOYER, pm, 'MockPoolManager', 'set', [poolId, sqrtP(140, stockIs0)]);
  nav = (await read(vault, 'MuseVault', 'nav')) as bigint;
  ok('META to $140 → nav 120 USDG', nav > 119_990_000n && nav < 120_010_000n, `${nav}`);
  const nps = (await read(vault, 'MuseVault', 'navPerShare')) as bigint;
  ok('nav per share 1.2', nps > 1_199_900_000_000_000_000n && nps < 1_200_100_000_000_000_000n, `${nps}`);

  console.log('\n— a second depositor pays the new price; the first one pays fees on her gain only');
  await send(BOB, vault, 'MuseVault', 'deposit', [60n * USD]);
  const bobShares = (await read(vault, 'MuseVault', 'balanceOf', [hex(BOB)])) as bigint;
  ok('bob gets 50 shares for 60 USDG at 1.2', bobShares > 49_990_000n && bobShares < 50_010_000n, `${bobShares}`);
  const supplyBefore = (await read(vault, 'MuseVault', 'totalSupply')) as bigint;
  await send(ALICE, vault, 'MuseVault', 'withdraw', [100n * USD]);
  const museFee = (await read(vault, 'MuseVault', 'balanceOf', [hex(MUSE)])) as bigint;
  const townFee = (await read(vault, 'MuseVault', 'balanceOf', [hex(TREASURY)])) as bigint;
  // gain 20 USDG → fee 2.2 USDG → 1.8333 shares at 1.2; town = 1/11 of that
  ok('fee shares: muse ≈1.667, town ≈0.167', museFee > 1_660_000n && museFee < 1_670_000n && townFee > 166_000n && townFee < 167_000n, `${museFee} ${townFee}`);
  const aliceUsdg = await bal(usdg, ALICE), aliceStock = await bal(stock, ALICE);
  const outShares = 100n * USD - museFee - townFee;
  ok('alice paid in kind, pro rata', aliceUsdg === (110n * USD * outShares) / supplyBefore && aliceStock === ((ONE / 2n) * outShares) / supplyBefore, `${aliceUsdg} USDG ${aliceStock} META`);
  ok('bob, no gain, pays no fee on withdraw', await (async () => { await send(BOB, vault, 'MuseVault', 'withdraw', [bobShares / 2n]); return (await read(vault, 'MuseVault', 'balanceOf', [hex(TREASURY)])) === townFee; })());

  console.log('\n— idle vaults close; closed vaults only pay out');
  ok('cannot close an active vault', await reverts(() => send(RANDO, vault, 'MuseVault', 'close'), 'StillActive()'));
  now += 31n * 86_400n;
  await send(RANDO, vault, 'MuseVault', 'close');
  ok('anyone closes after 30 idle days', (await read(vault, 'MuseVault', 'closed')) === true);
  ok('closed: no swaps', await reverts(() => send(MUSE, vault, 'MuseVault', 'swap', [hex(usdg), hex(stock), 1n * USD, 0n, swapData(usdg, stock, 1n * USD)]), 'IsClosed()'));
  ok('closed: no deposits', await reverts(() => send(BOB, vault, 'MuseVault', 'deposit', [1n * USD]), 'IsClosed()'));
  await send(BOB, vault, 'MuseVault', 'withdraw', [bobShares - bobShares / 2n]);
  ok('closed: withdrawals still work', (await read(vault, 'MuseVault', 'balanceOf', [hex(BOB)])) === 0n);
  ok('stake stays while fee shares exist', await reverts(() => send(MUSE, factory, 'MuseVaultFactory', 'returnStake', [hex(vault)]), 'NotEmpty()'));
  await send(MUSE, vault, 'MuseVault', 'withdraw', [museFee]); await send(TREASURY, vault, 'MuseVault', 'withdraw', [townFee]);
  await send(MUSE, factory, 'MuseVaultFactory', 'returnStake', [hex(vault)]);
  ok('empty + closed → stake returned', (await bal(muse, MUSE)) === STAKE);

  console.log('\n— three losing months → slashed to depositors');
  await send(DEPLOYER, muse, 'MockERC20', 'mint', [hex(MUSE2), STAKE]);
  await send(MUSE2, muse, 'MockERC20', 'approve', [hex(factory), STAKE]);
  await send(MUSE2, factory, 'MuseVaultFactory', 'openVault', ['sable vault', 'vSABLE']);
  const vault2 = createAddressFromString((await read(factory, 'MuseVaultFactory', 'vaultOf', [hex(MUSE2)])) as string);
  await send(DEPLOYER, usdg, 'MockERC20', 'mint', [hex(ALICE), 100n * USD]);
  await send(ALICE, usdg, 'MockERC20', 'approve', [hex(vault2), 100n * USD]);
  await send(ALICE, vault2, 'MuseVault', 'deposit', [100n * USD]);
  await send(DEPLOYER, router, 'MockRouter', 'setRate', [10n ** 11n, 14n]); // fair at $140
  await send(MUSE2, vault2, 'MuseVault', 'swap', [hex(usdg), hex(stock), 100n * USD, 0n, swapData(usdg, stock, 100n * USD)]);
  ok('checkpoint too soon', await reverts(() => send(RANDO, factory, 'MuseVaultFactory', 'checkpoint', [hex(vault2)]), 'TooSoon()'));
  for (const px of [120, 100, 80]) {
    now += 30n * 86_400n;
    await send(DEPLOYER, pm, 'MockPoolManager', 'set', [poolId, sqrtP(px, stockIs0)]);
    await send(RANDO, factory, 'MuseVaultFactory', 'checkpoint', [hex(vault2)]);
  }
  ok('three declines recorded', (await read(factory, 'MuseVaultFactory', 'declines', [hex(vault2)])) === 3n);
  await send(RANDO, factory, 'MuseVaultFactory', 'slash', [hex(vault2)]);
  ok('stake moved into the vault, vault closed', (await bal(muse, vault2)) === STAKE && (await read(vault2, 'MuseVault', 'closed')) === true);
  const aliceMuseBefore = await bal(muse, ALICE);
  await send(ALICE, vault2, 'MuseVault', 'withdraw', [100n * USD]);
  ok('depositor receives the slashed stake in kind', (await bal(muse, ALICE)) - aliceMuseBefore === STAKE);
  ok('slashed muse cannot recover the stake', await reverts(() => send(MUSE2, factory, 'MuseVaultFactory', 'returnStake', [hex(vault2)])) || (await bal(muse, MUSE2)) === 0n);

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
