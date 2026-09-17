import { NextResponse } from 'next/server';
import { town } from '@/lib/agents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const t = await town();
  return NextResponse.json({ ok: true, ...t }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } });
}
