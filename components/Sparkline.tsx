/** A 2px line, nothing else. The row it sits in carries the numbers. */
export default function Sparkline({ points, w = 104, h = 28, label }: { points: number[]; w?: number; h?: number; label?: string }) {
  if (points.length < 2) return <svg width={w} height={h} aria-hidden><line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="#e8dccb" strokeWidth="2" strokeDasharray="2 4" /></svg>;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const up = points[points.length - 1] >= points[0];
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${((i / (points.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((p - min) / span) * (h - 6)).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={!label}>
      <path d={d} fill="none" stroke={up ? '#236b3f' : '#c0432f'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w - 2} cy={h - 3 - ((points[points.length - 1] - min) / span) * (h - 6)} r="3" fill={up ? '#236b3f' : '#c0432f'} stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}
