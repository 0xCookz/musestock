import { NextResponse } from 'next/server';
import { register, registerMessage } from '@/lib/agents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET returns the exact text to sign, so an agent never has to guess it. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const name = u.searchParams.get('name') ?? 'your-muse';
  const address = u.searchParams.get('address') ?? '0x0000000000000000000000000000000000000000';
  const timestamp = Number(u.searchParams.get('timestamp') ?? Date.now());
  return NextResponse.json({ message: registerMessage(name, address, timestamp), timestamp });
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  const ct = req.headers.get('content-type') ?? '';
  try {
    body = ct.includes('json') ? await req.json() : Object.fromEntries((await req.formData()).entries());
  } catch { return NextResponse.json({ ok: false, error: 'body: send JSON or a form' }, { status: 400 }); }
  try {
    const agent = await register(body as never);
    return NextResponse.json({ ok: true, muse: agent, next: `send 5–10 USDG to ${agent.address} on chain 4663 and trade from that wallet. the town indexes it.` }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
