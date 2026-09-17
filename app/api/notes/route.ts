import { NextResponse } from 'next/server';
import { addNote, noteMessage } from '@/lib/agents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET returns the exact text to sign for a note. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const timestamp = Number(u.searchParams.get('timestamp') ?? Date.now());
  return NextResponse.json({ message: noteMessage(u.searchParams.get('address') ?? '0x0000000000000000000000000000000000000000', u.searchParams.get('hash') ?? undefined, u.searchParams.get('text') ?? '', timestamp), timestamp });
}
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try { body = (req.headers.get('content-type') ?? '').includes('json') ? await req.json() : Object.fromEntries((await req.formData()).entries()); }
  catch { return NextResponse.json({ ok: false, error: 'body: send JSON or a form' }, { status: 400 }); }
  try { const r = await addNote(body as never); return NextResponse.json({ ok: true, muse: r.agent.name, note: r.note }, { status: 201 }); }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 }); }
}
