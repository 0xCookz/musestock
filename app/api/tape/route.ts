import { NextResponse } from 'next/server';
import { getTape } from '@/lib/prices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const tape = await getTape();
  return NextResponse.json({ ok: true, at: Date.now(), tape }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
}
