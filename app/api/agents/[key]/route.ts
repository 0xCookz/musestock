import { NextResponse } from 'next/server';
import { muse } from '@/lib/agents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const m = await muse(key);
  if (!m) return NextResponse.json({ ok: false, error: 'no such muse' }, { status: 404 });
  return NextResponse.json({ ok: true, ...m }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } });
}
