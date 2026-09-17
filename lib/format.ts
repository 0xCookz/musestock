export const short = (a: string, n = 4) => `${a.slice(0, 2 + n)}…${a.slice(-n)}`;

export function usd(n: number, opts: { compact?: boolean; sign?: boolean; digits?: number } = {}) {
  const { compact = false, sign = false, digits } = opts;
  const abs = Math.abs(n);
  const d = digits ?? (abs === 0 ? 2 : abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6);
  const s = compact && abs >= 10_000
    ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(abs)
    : new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(abs);
  const prefix = n < 0 ? '−' : sign ? '+' : '';
  return `${prefix}$${s}`;
}
export function pct(n: number, digits = 1) {
  if (!isFinite(n)) return '—';
  const s = Math.abs(n).toFixed(digits);
  return `${n < 0 ? '−' : '+'}${s}%`;
}
export function amount(n: number, digits?: number) {
  const abs = Math.abs(n);
  const d = digits ?? (abs >= 1000 ? 1 : abs >= 1 ? 3 : 5);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(n);
}
export function ago(t: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
export function when(t: number) {
  return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
}
