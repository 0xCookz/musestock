import type { Config } from 'tailwindcss';

/**
 * Musetrade is a sibling of musebook, so the ground is musebook's: warm cream,
 * brown ink, pastel accents, round everything, Baloo 2. What is ours is one
 * colour — clover, the green glow of the chart on the mascot's terminal — and it means exactly one thing on
 * the page: money that went up. Coral (musebook's own) is money that went down.
 *
 * Contrast on cream #fff8f1 (validated with the dataviz palette script):
 *   ink #4a3b32 10.1 · ink2 #6b5646 6.3 · ink3 #7d6858 4.7 (AA text)
 *   clover.deep #236b3f 5.9 · coral.deep #c0432f 5.1 (AA text, used for P&L)
 *   clover #2f8a52 3.9 · coral #ff7d6b 2.6 → fills, rings, large type only.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: '#fff8f1', deep: '#fff1e3', card: '#ffffff' },
        ink: { DEFAULT: '#4a3b32', 2: '#6b5646', 3: '#7d6858', soft: '#8a7364' },
        peach: '#ffb98a',
        coral: { DEFAULT: '#ff7d6b', deep: '#c0432f', tint: '#ffe9e5' },
        honey: '#ffc93c',
        lav: '#cdb4f6',
        mint: '#a8e6cf',
        sky: '#aed9ff',
        rose: '#ffc2d4',
        clover: { DEFAULT: '#2f8a52', deep: '#236b3f', tint: '#e2f3e8', glow: '#86d3a0', ink: '#174a2b' },
      },
      fontFamily: {
        sans: ['"Baloo 2"', 'ui-rounded', '"SF Pro Rounded"', 'Quicksand', 'system-ui', 'sans-serif'],
        mono: ['"Fragment Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: { card: '26px', tile: '18px' },
      boxShadow: {
        soft: '0 10px 30px rgba(255, 125, 107, .14)',
        lift: '0 18px 50px rgba(74, 59, 50, .16)',
        clover: '0 10px 30px rgba(47, 138, 82, .22)',
      },
      fontSize: {
        micro: ['0.75rem', { lineHeight: '1.3', letterSpacing: '0.02em' }],
        body: ['1.0625rem', { lineHeight: '1.6' }],
        lede: ['clamp(1.125rem, 1rem + 0.6vw, 1.375rem)', { lineHeight: '1.5' }],
        h2: ['clamp(1.875rem, 1.35rem + 2.4vw, 3.25rem)', { lineHeight: '1.05', letterSpacing: '-0.01em' }],
        h1: ['clamp(2.5rem, 1.6rem + 4.6vw, 5.75rem)', { lineHeight: '0.98', letterSpacing: '-0.02em' }],
      },
      maxWidth: { sheet: '76rem', column: '38rem' },
      transitionTimingFunction: { plush: 'cubic-bezier(0.34, 1.56, 0.64, 1)', ease: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
      keyframes: {
        bob: { '0%,100%': { transform: 'translateY(0) rotate(-2deg)' }, '50%': { transform: 'translateY(-10px) rotate(2deg)' } },
        tape: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        drift: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(30px,-20px) scale(1.06)' } },
      },
      animation: { bob: 'bob 3.4s ease-in-out infinite', tape: 'tape 48s linear infinite', drift: 'drift 18s ease-in-out infinite' },
    },
  },
  plugins: [],
};
export default config;
