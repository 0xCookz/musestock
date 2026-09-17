'use client';
import { useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, custom, fallback, formatUnits, http, parseAbi, parseUnits, type Address } from 'viem';
import { usd } from '@/lib/format';

/**
 * Copy this muse. Reads the vault straight from the chain in the browser and
 * lets a connected wallet deposit USDG or withdraw shares. Paid in kind, fees
 * on gains only, cap per vault: all of that is the contract's, this only shows it.
 */
const chain = { id: 4663, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['https://robinhood.drpc.org'] } } } as const;
const pub = createPublicClient({ chain, transport: fallback([http('https://robinhood.drpc.org'), http('https://robinhood-rpc.publicnode.com'), http('https://rpc.mainnet.chain.robinhood.com')]) });
const factoryAbi = parseAbi(['function vaultOf(address) view returns (address)', 'function vaultCap() view returns (uint256)']);
const vaultAbi = parseAbi(['function nav() view returns (uint256)', 'function navPerShare() view returns (uint256)', 'function totalSupply() view returns (uint256)', 'function balanceOf(address) view returns (uint256)', 'function entryPrice(address) view returns (uint256)', 'function closed() view returns (bool)', 'function deposit(uint256) returns (uint256)', 'function withdraw(uint256)']);
const erc20 = parseAbi(['function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)']);
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' as Address;
type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

export default function VaultPanel({ factory, muse, name }: { factory: Address; muse: Address; name: string }) {
  const [vault, setVault] = useState<Address | null>(null);
  const [info, setInfo] = useState<{ nav: bigint; nps: bigint; supply: bigint; cap: bigint; closed: boolean } | null>(null);
  const [me, setMe] = useState<Address | null>(null);
  const [mine, setMine] = useState<{ shares: bigint; entry: bigint; usdg: bigint } | null>(null);
  const [amount, setAmount] = useState('10');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const v = await pub.readContract({ address: factory, abi: factoryAbi, functionName: 'vaultOf', args: [muse] });
    if (/^0x0+$/.test(v)) { setVault(null); return; }
    setVault(v);
    const [nav, nps, supply, cap, closed] = await Promise.all([
      pub.readContract({ address: v, abi: vaultAbi, functionName: 'nav' }), pub.readContract({ address: v, abi: vaultAbi, functionName: 'navPerShare' }),
      pub.readContract({ address: v, abi: vaultAbi, functionName: 'totalSupply' }), pub.readContract({ address: factory, abi: factoryAbi, functionName: 'vaultCap' }),
      pub.readContract({ address: v, abi: vaultAbi, functionName: 'closed' }),
    ]);
    setInfo({ nav, nps, supply, cap, closed });
    if (me) {
      const [shares, entry, usdg] = await Promise.all([pub.readContract({ address: v, abi: vaultAbi, functionName: 'balanceOf', args: [me] }), pub.readContract({ address: v, abi: vaultAbi, functionName: 'entryPrice', args: [me] }), pub.readContract({ address: USDG, abi: erc20, functionName: 'balanceOf', args: [me] })]);
      setMine({ shares, entry, usdg });
    }
  };
  useEffect(() => { load().catch((e) => setErr(String(e.message ?? e))); }, [factory, muse, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const eth = () => (typeof window !== 'undefined' ? (window as unknown as { ethereum?: Eth }).ethereum : undefined);
  const connect = async () => {
    const e = eth(); if (!e) { setErr('no wallet in this browser'); return; }
    const [a] = (await e.request({ method: 'eth_requestAccounts' })) as Address[];
    try { await e.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1237' }] }); }
    catch { await e.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x1237', chainName: 'Robinhood Chain', nativeCurrency: chain.nativeCurrency, rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'], blockExplorerUrls: ['https://robinhoodchain.blockscout.com'] }] }); }
    setMe(a);
  };
  const wallet = () => createWalletClient({ chain, transport: custom(eth()!), account: me! });
  const run = async (label: string, f: () => Promise<void>) => { setErr(null); setBusy(label); try { await f(); await load(); } catch (e) { setErr(String((e as Error).message ?? e).split('\n')[0].slice(0, 160)); } finally { setBusy(null); } };
  const deposit = () => run('depositing', async () => {
    const w = wallet(); const amt = parseUnits(amount || '0', 6);
    const allowance = await pub.readContract({ address: USDG, abi: erc20, functionName: 'allowance', args: [me!, vault!] });
    if (allowance < amt) { const h = await w.writeContract({ address: USDG, abi: erc20, functionName: 'approve', args: [vault!, amt] }); await pub.waitForTransactionReceipt({ hash: h }); }
    const h = await w.writeContract({ address: vault!, abi: vaultAbi, functionName: 'deposit', args: [amt] }); await pub.waitForTransactionReceipt({ hash: h });
  });
  const withdrawAll = () => run('withdrawing', async () => { const h = await wallet().writeContract({ address: vault!, abi: vaultAbi, functionName: 'withdraw', args: [mine!.shares] }); await pub.waitForTransactionReceipt({ hash: h }); });

  if (!vault) return (
    <div className="receipt rounded-tile border border-ink/10 p-5">
      <p className="font-extrabold text-lg">copy {name}</p>
      <p className="mt-1 text-ink-2">this muse has not opened a vault yet. it needs a $MUSESTOCK stake and a month of receipts.</p>
    </div>
  );
  const navPer = info ? Number(formatUnits(info.nps, 18)) : 1;
  const mineValue = mine && info ? Number(formatUnits(mine.shares, 6)) * navPer : 0;
  const mineGain = mine && mine.shares > 0n ? mineValue - Number(formatUnits(mine.shares, 6)) * Number(formatUnits(mine.entry, 18)) : 0;
  return (
    <div className="receipt rounded-tile border border-ink/10 p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="font-extrabold text-lg">copy {name}</p>
        <span className={`rounded-full text-micro font-bold px-2.5 py-1 ${info?.closed ? 'bg-coral-tint text-coral-deep' : 'bg-clover-tint text-clover-deep'}`}>{info?.closed ? 'closed · withdrawals only' : 'open'}</span>
      </div>
      {info && (
        <dl className="mt-4 grid grid-cols-3 gap-3 text-[15px]">
          <div><dt className="text-micro text-ink-3">vault nav</dt><dd className="num font-extrabold">{usd(Number(formatUnits(info.nav, 6)))}</dd></div>
          <div><dt className="text-micro text-ink-3">per share</dt><dd className="num font-extrabold">{navPer.toFixed(4)}</dd></div>
          <div><dt className="text-micro text-ink-3">room</dt><dd className="num font-extrabold">{usd(Math.max(0, Number(formatUnits(info.cap - info.nav, 6))))}</dd></div>
        </dl>
      )}
      <p className="mt-3 text-micro text-ink-3">deposits in USDG, paid out in kind. 10% of your gain to the muse, 1% to the town, nothing otherwise. <a className="underline underline-offset-4" href={`https://robinhoodchain.blockscout.com/address/${vault}`} target="_blank" rel="noreferrer">vault contract</a></p>
      {!me ? (
        <button type="button" onClick={connect} className="mt-4 w-full rounded-full bg-clover text-white font-bold px-6 py-3 min-h-[44px] hover:bg-clover-deep">connect wallet</button>
      ) : (
        <div className="mt-4 space-y-3">
          {mine && <p className="num text-[15px]">you: {formatUnits(mine.shares, 6)} shares ≈ {usd(mineValue)} {mine.shares > 0n && <span className={mineGain >= 0 ? 'text-clover-deep' : 'text-coral-deep'}>({mineGain >= 0 ? '+' : '−'}{usd(Math.abs(mineGain))})</span>} · wallet {usd(Number(formatUnits(mine.usdg, 6)))} USDG</p>}
          {!info?.closed && (
            <div className="flex gap-2">
              <input aria-label="USDG to deposit" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="num flex-1 rounded-full border border-ink/15 bg-white px-4 py-2 min-h-[44px]" />
              <button type="button" disabled={!!busy} onClick={deposit} className="rounded-full bg-clover text-white font-bold px-5 min-h-[44px] hover:bg-clover-deep disabled:opacity-50">{busy === 'depositing' ? 'depositing…' : 'deposit USDG'}</button>
            </div>
          )}
          {mine && mine.shares > 0n && <button type="button" disabled={!!busy} onClick={withdrawAll} className="rounded-full bg-white border border-ink/15 font-bold px-5 py-2 min-h-[44px] hover:border-clover/40 disabled:opacity-50">{busy === 'withdrawing' ? 'withdrawing…' : 'withdraw everything, in kind'}</button>}
        </div>
      )}
      {err && <p className="mt-3 text-coral-deep text-[14px]" role="alert">{err}</p>}
    </div>
  );
}
