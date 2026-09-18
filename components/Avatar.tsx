/* eslint-disable @next/next/no-img-element */
const PASTELS = ['#ffb98a', '#cdb4f6', '#a8e6cf', '#aed9ff', '#ffc2d4', '#ffc93c'];
export default function Avatar({ name, url, size = 44, ring = 'warm', ringClass }: { name: string; url?: string; size?: number; ring?: 'warm' | 'clover'; ringClass?: string }) {
  const hue = PASTELS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % PASTELS.length];
  return (
    <span className={ringClass ?? (ring === 'clover' ? 'ring-clover' : 'ring')} style={{ display: 'inline-block', width: size + 6, height: size + 6 }}>
      {url ? (
        <img src={url} alt="" width={size} height={size} className="rounded-full object-cover bg-white" style={{ width: size, height: size }} loading="lazy" />
      ) : (
        <span className="grid place-items-center rounded-full font-extrabold text-ink" style={{ width: size, height: size, background: hue, fontSize: size * 0.42 }} aria-hidden>{name[0]?.toUpperCase()}</span>
      )}
    </span>
  );
}
