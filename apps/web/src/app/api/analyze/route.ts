import { NextResponse } from 'next/server';
import {
  AnalyzeRequestSchema,
  analysisId as newAnalysisId,
  ARTIFACT_TTL_HOURS,
} from '@resumerx/shared';
import { getStore } from '@/server/db';
import { getStorage, resumeKey } from '@/server/storage';
import { parsePdfBytes, PdfServiceError } from '@/server/pdf-service';
import { runAnalysis } from '@/server/analyze';
import { check, ipOf, LIMITS } from '@/server/rate-limit';
import { forRequest } from '@/server/logger';
import { captureError } from '@/server/sentry';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TTL_MS = ARTIFACT_TTL_HOURS * 60 * 60 * 1000;

export async function POST(req: Request) {
  const log = forRequest(req);
  const started = Date.now();
  const rl = check(`analyze:${ipOf(req)}`, LIMITS.analyze.limit, LIMITS.analyze.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    );
  }

  let body;
  try {
    body = AnalyzeRequestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_request', detail: (err as Error).message },
      { status: 400 },
    );
  }

  const store = getStore();
  const storage = getStorage();

  // if the resume row already exists (retry), reuse the parse
  let resume = await store.getResume(body.resumeId);
  if (!resume) {
    const key = resumeKey(body.resumeId);
    let bytes: Buffer;
    try {
      bytes = await storage.getObject(key);
    } catch {
      return NextResponse.json(
        { error: 'upload_not_found', detail: 'finish the upload before analyzing' },
        { status: 404 },
      );
    }

    let parsed;
    try {
      parsed = await parsePdfBytes(bytes);
    } catch (err) {
      if (err instanceof PdfServiceError) {
        return NextResponse.json(
          { error: 'parse_failed', detail: err.message, status: err.status },
          { status: 502 },
        );
      }
      throw err;
    }

    await store.insertResume({ id: body.resumeId, r2Key: key, parsed, ttlMs: TTL_MS });
    resume = await store.getResume(body.resumeId);
  }

  const id = newAnalysisId();

  let analysisOut;
  try {
    analysisOut = await runAnalysis({
      analysisId: id,
      parsed: resume!.parsed,
      jobDescription: body.jobDescription,
    });
  } catch (err) {
    log.error({ err }, 'analysis_failed');
    captureError(err, { route: 'analyze', resumeId: body.resumeId });
    return NextResponse.json(
      { error: 'analysis_failed', detail: (err as Error).message },
      { status: 502 },
    );
  }

  await store.insertAnalysis({
    id,
    resumeId: body.resumeId,
    jobDescription: body.jobDescription,
    result: analysisOut.analysis,
    ttlMs: TTL_MS,
  });

  log.info(
    {
      analysisId: id,
      resumeId: body.resumeId,
      usedStub: analysisOut.usedStub,
      ms: Date.now() - started,
    },
    'analyze ok',
  );
  return NextResponse.json({
    analysisId: id,
    resumeId: body.resumeId,
    usedStub: analysisOut.usedStub,
  });
}
