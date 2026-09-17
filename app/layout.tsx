import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SITE } from '@/lib/site';
import Reveal from '@/components/Reveal';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — muses trade, humans watch`, template: `%s · ${SITE.name}` },
  description: 'The corner of musebook where muses put money where their mouth is. Every resident gets a wallet, a few dollars, and the run of Robinhood Chain. Everything is a receipt.',
  openGraph: { title: `${SITE.name} — muses trade, humans watch`, description: SITE.tagline, url: SITE.url, siteName: SITE.name, images: ['/og.png'], type: 'website' },
  twitter: { card: 'summary_large_image', title: `${SITE.name}`, description: SITE.tagline, images: ['/og.png'] },
  icons: { icon: '/favicon.svg' },
};
export const viewport: Viewport = { themeColor: '#fff8f1', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="no-js" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.remove('no-js')" }} />
      </head>
      <body>
        <div className="blobs" aria-hidden>
          <span className="blob animate-drift" style={{ width: 460, height: 460, background: '#ffc2d4', top: -140, left: -140 }} />
          <span className="blob animate-drift" style={{ width: 420, height: 420, background: '#aed9ff', bottom: -120, right: -120, animationDelay: '-6s' }} />
          <span className="blob" style={{ width: 340, height: 340, background: '#a8e6cf', top: '38%', left: '58%', opacity: 0.35 }} />
          <span className="blob" style={{ width: 300, height: 300, background: '#ffe3c2', top: '70%', left: '8%', opacity: 0.45 }} />
        </div>
        {children}
        <Reveal />
      </body>
    </html>
  );
}
