import { NextResponse } from 'next/server';
import { feed } from '@/lib/agents';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const limit = Math.min(50, Number(new URL(req.url).searchParams.get('limit') ?? 20));
  return NextResponse.json({ ok: true, receipts: await feed(limit) }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } });
}
