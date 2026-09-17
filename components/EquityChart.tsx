'use client';
import { useMemo, useRef, useState } from 'react';
import type { Snapshot } from '@/lib/store';
import { usd, when } from '@/lib/format';

/**
 * One series, one axis, a crosshair. Colour says up or down from the first
 * point; the sign in the tooltip says it again for anyone the colour fails.
 */
export default function EquityChart({ snapshots }: { snapshots: Snapshot[] }) {
  const W = 720, H = 240, L = 8, R = 8, T = 14, B = 26;
  const pts = useMemo(() => snapshots.filter((s) => Number.isFinite(s.equity)), [snapshots]);
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  if (pts.length < 2) {
    return (
      <div className="rounded-tile bg-cream-deep text-ink-2 text-[15px] p-6 grid place-items-center min-h-[180px]">
        the curve starts after the second snapshot. the town takes one every few minutes.
      </div>
    );
  }
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const min = Math.min(...pts.map((p) => p.equity)), max = Math.max(...pts.map((p) => p.equity));
  const pad = (max - min) * 0.12 || 1;
  const y0 = min - pad, y1 = max + pad;
  const x = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ');
  const up = pts[pts.length - 1].equity >= pts[0].equity;
  const stroke = up ? '#236b3f' : '#c0432f';
  const ticks = [y1 - pad, (y0 + y1) / 2, y0 + pad];
  const h = hover != null ? pts[hover] : null;

  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const dd = Math.abs(x(p.t) - px); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  };

  return (
    <figure className="relative">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-none select-none" role="img"
        aria-label={`equity from ${usd(pts[0].equity)} to ${usd(pts[pts.length - 1].equity)}`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#4a3b32" strokeOpacity="0.08" />
            <text x={W - R} y={y(v) - 4} textAnchor="end" fontSize="11" fill="#7d6858" className="num">{usd(v, { digits: v >= 100 ? 0 : 2 })}</text>
          </g>
        ))}
        <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {h && (
          <g>
            <line x1={x(h.t)} x2={x(h.t)} y1={T} y2={H - B} stroke="#4a3b32" strokeOpacity="0.25" strokeDasharray="3 3" />
            <circle cx={x(h.t)} cy={y(h.equity)} r="5" fill={stroke} stroke="#fff" strokeWidth="2" />
          </g>
        )}
        <text x={L} y={H - 8} fontSize="11" fill="#7d6858">{when(t0)}</text>
        <text x={W - R} y={H - 8} fontSize="11" fill="#7d6858" textAnchor="end">{when(t1)}</text>
      </svg>
      {h && (
        <div className="pointer-events-none absolute -top-1 rounded-xl bg-ink text-cream text-[13px] px-3 py-2 shadow-lift"
          style={{ left: `${(x(h.t) / W) * 100}%`, transform: `translateX(${x(h.t) > W * 0.7 ? '-100%' : '-12px'})` }} role="status">
          <span className="num font-semibold">{usd(h.equity)}</span> <span className={h.equity - (h.deposits - h.withdrawals) >= 0 ? 'text-clover-glow' : 'text-rose'}>{h.equity - (h.deposits - h.withdrawals) >= 0 ? '+' : '−'}{usd(Math.abs(h.equity - (h.deposits - h.withdrawals)))}</span>
          <div className="text-cream/70">{when(h.t)} · {h.trades} trades</div>
        </div>
      )}
      <details className="mt-3 text-[14px]">
        <summary className="cursor-pointer text-ink-2 hover:text-clover-deep">as a table</summary>
        <div className="scroll-x mt-2 max-h-64 overflow-y-auto rounded-tile border border-ink/10">
          <table className="w-full text-left num">
            <thead className="sticky top-0 bg-cream-deep"><tr><th className="px-3 py-2 font-semibold">time</th><th className="px-3 py-2 font-semibold">equity</th><th className="px-3 py-2 font-semibold">net deposits</th><th className="px-3 py-2 font-semibold">trades</th></tr></thead>
            <tbody>{pts.slice().reverse().map((p) => <tr key={p.t} className="border-t border-ink/5"><td className="px-3 py-1.5">{when(p.t)}</td><td className="px-3 py-1.5">{usd(p.equity)}</td><td className="px-3 py-1.5">{usd(p.deposits - p.withdrawals)}</td><td className="px-3 py-1.5">{p.trades}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
