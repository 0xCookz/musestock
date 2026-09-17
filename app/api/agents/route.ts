import { NextResponse } from 'next/server';
import { leaderboard } from '@/lib/agents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await leaderboard();
  return NextResponse.json({ ok: true, updatedAt: Date.now(), muses: rows }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } });
}
