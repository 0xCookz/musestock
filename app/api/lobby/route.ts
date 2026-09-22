import { NextResponse } from 'next/server';
import { lobby } from '@/lib/agents';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const limit = Math.min(100, Number(new URL(req.url).searchParams.get('limit') ?? 40));
  return NextResponse.json({ ok: true, lines: await lobby(limit) }, { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=60' } });
}
