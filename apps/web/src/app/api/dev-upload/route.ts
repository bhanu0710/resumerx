import { NextResponse } from 'next/server';
import { env } from '@/server/env';
import { writeLocalObject } from '@/server/storage';
import { UPLOAD_MAX_BYTES } from '@resumerx/shared';

export const runtime = 'nodejs';

// dev-only upload sink. in prod the browser PUTs directly to R2, so this route
// 404s. only enabled when r2.useLocalFs is true.
export async function PUT(req: Request) {
  if (!env.r2.useLocalFs) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'missing_key' }, { status: 400 });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength > UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }

  await writeLocalObject(key, buf);
  return NextResponse.json({ ok: true, key, size: buf.byteLength });
}
