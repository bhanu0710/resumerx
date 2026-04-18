import { NextResponse } from 'next/server';
import { AcceptRewriteRequestSchema } from '@resumerx/shared';
import { getStore } from '@/server/db';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let body;
  try {
    body = AcceptRewriteRequestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_request', detail: (err as Error).message },
      { status: 400 },
    );
  }

  const store = getStore();
  const row = await store.getRewrite(params.id);
  if (!row) {
    return NextResponse.json({ error: 'rewrite_not_found' }, { status: 404 });
  }

  const map: Record<string, string> = {};
  for (const a of body.acceptances) map[a.bulletId] = a.finalText;
  await store.setAcceptedBullets(params.id, map);

  return NextResponse.json({ ok: true, count: body.acceptances.length });
}
