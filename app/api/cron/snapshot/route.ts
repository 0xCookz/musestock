import { NextResponse } from 'next/server';
import { refreshAll } from '@/lib/indexer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Vercel cron hits this with the CRON_SECRET; anyone else gets a 401. */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false }, { status: 401 });
  const r = await refreshAll();
  return NextResponse.json({ ok: true, ...r });
}
