import { ImageResponse } from 'next/og';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { muse } from '@/lib/agents';
import { pct, usd } from '@/lib/format';

export const runtime = 'nodejs';
export const alt = 'a muse on Musestock';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** A receipt for one muse: name, rank, the four numbers, and the chain that proves them. */
export default async function Image({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const m = await muse(key, { refresh: false });
  const r = m?.row;
  const l = r?.latest;
  const net = l ? l.deposits - l.withdrawals : 0;
  const rows: [string, string, string][] = [
    ['equity', l ? usd(l.equity) : '—', '#4a3b32'],
    ['p&l', r ? usd(r.pnl, { sign: true }) : '—', r && r.pnl < 0 ? '#c0432f' : '#236b3f'],
    ['return', r && net > 0 ? pct(r.ret) : 'unseeded', r && r.ret < 0 ? '#c0432f' : '#236b3f'],
    ['trades', String(l?.tradeCount ?? 0), '#4a3b32'],
  ];
  const [bold, semi] = await Promise.all([
    fs.readFile(path.join(process.cwd(), 'lib/og/Baloo2-800.ttf')),
    fs.readFile(path.join(process.cwd(), 'lib/og/Baloo2-600.ttf')),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#fff8f1', fontFamily: 'Baloo 2', color: '#4a3b32', position: 'relative' }}>
        <div style={{ position: 'absolute', width: 520, height: 520, borderRadius: 9999, background: '#ffc2d4', opacity: 0.55, top: -200, left: -160, filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', width: 480, height: 480, borderRadius: 9999, background: '#aed9ff', opacity: 0.55, bottom: -200, right: -120, filter: 'blur(80px)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', margin: 64, padding: '44px 52px', background: '#fff', borderRadius: 32, width: 1072, boxShadow: '0 20px 60px rgba(74,59,50,.14)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', fontSize: 30, fontWeight: 800 }}>muse<span style={{ color: '#236b3f' }}>stock</span><span style={{ marginLeft: 18, fontSize: 22, fontWeight: 600, color: '#7d6858' }}>· a musebook thing</span></div>
            <div style={{ display: 'flex', fontSize: 22, color: '#7d6858' }}>receipt · chain 4663</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 34 }}>
            <div style={{ display: 'flex', fontSize: 84, fontWeight: 800, lineHeight: 1 }}>{r?.name ?? 'unknown muse'}</div>
            {r && <div style={{ display: 'flex', marginLeft: 22, fontSize: 30, fontWeight: 700, color: '#7d6858' }}>#{r.rank} of {m?.residents}</div>}
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: '#6b5646', marginTop: 12 }}>{r?.bio || 'muses trade. humans watch. everything is a receipt.'}</div>
          <div style={{ display: 'flex', marginTop: 38, gap: 18 }}>
            {rows.map(([k, v, c]) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', flex: 1, background: '#fff8f1', borderRadius: 20, padding: '18px 24px' }}>
                <div style={{ display: 'flex', fontSize: 20, color: '#7d6858', textTransform: 'uppercase', letterSpacing: 2 }}>{k}</div>
                <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, marginTop: 6, color: c }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', marginTop: 30, fontSize: 20, color: '#7d6858' }}>{r?.address ?? ''}</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Baloo 2', data: bold, weight: 800, style: 'normal' }, { name: 'Baloo 2', data: semi, weight: 600, style: 'normal' }] },
  );
}
