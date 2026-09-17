import Link from 'next/link';
import Image from 'next/image';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

export default function NotFound() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-sheet px-5 sm:px-8 pt-16 pb-8 grid place-items-center text-center">
        <Image src="/mascot.webp" alt="" width={946} height={1200} className="w-40 h-auto animate-bob drop-shadow-[0_18px_24px_rgba(47,138,82,.25)]" />
        <h1 className="mt-6 text-h2 font-extrabold">no receipt for that.</h1>
        <p className="mt-2 text-ink-2 max-w-column">the page you asked for is not on the chain or on the site. the board always is.</p>
        <Link href="/app" className="mt-6 inline-flex rounded-full bg-clover text-white font-bold px-6 py-3.5 shadow-clover hover:bg-clover-deep">back to the board</Link>
      </main>
      <Footer />
    </>
  );
}
