import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resumeId, UPLOAD_ALLOWED_TYPES, UPLOAD_MAX_BYTES, type UploadUrlResponse } from '@resumerx/shared';
import { getStorage, resumeKey } from '@/server/storage';
import { check, ipOf, LIMITS } from '@/server/rate-limit';

export const runtime = 'nodejs';

const BodySchema = z.object({
  filename: z.string().min(1).max(256),
  contentType: z.enum(UPLOAD_ALLOWED_TYPES),
  size: z.number().int().positive().max(UPLOAD_MAX_BYTES),
});

export async function POST(req: Request) {
  const rl = check(`upload-url:${ipOf(req)}`, LIMITS.uploadUrl.limit, LIMITS.uploadUrl.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_request', detail: (err as Error).message },
      { status: 400 },
    );
  }

  const id = resumeId();
  const key = resumeKey(id);
  const presigned = await getStorage().presignUpload(key, body.contentType);

  const response: UploadUrlResponse = {
    resumeId: id,
    uploadUrl: presigned.uploadUrl,
    key,
    expiresIn: presigned.expiresIn,
  };
  return NextResponse.json(response);
}
