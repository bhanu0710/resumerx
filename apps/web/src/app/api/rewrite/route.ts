import { NextResponse } from 'next/server';
import { RewriteRequestSchema, ARTIFACT_TTL_HOURS } from '@resumerx/shared';
import { getStore } from '@/server/db';
import { runRewrite, selectJdKeywords } from '@/server/rewrite';
import { check, ipOf, LIMITS } from '@/server/rate-limit';
import { forRequest } from '@/server/logger';
import { captureError } from '@/server/sentry';

export const runtime = 'nodejs';
export const maxDuration = 300;

const TTL_MS = ARTIFACT_TTL_HOURS * 60 * 60 * 1000;

export async function POST(req: Request) {
  const log = forRequest(req);
  const started = Date.now();
  const rl = check(`rewrite:${ipOf(req)}`, LIMITS.rewrite.limit, LIMITS.rewrite.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    );
  }

  let body;
  try {
    body = RewriteRequestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_request', detail: (err as Error).message },
      { status: 400 },
    );
  }

  const store = getStore();
  const analysis = await store.getAnalysis(body.analysisId);
  if (!analysis) {
    return NextResponse.json({ error: 'analysis_not_found' }, { status: 404 });
  }
  const resume = await store.getResume(analysis.resumeId);
  if (!resume) {
    return NextResponse.json({ error: 'resume_not_found' }, { status: 404 });
  }

  const jdKeywords = selectJdKeywords(analysis.result.keywordMatch);

  let result;
  try {
    result = await runRewrite({
      analysisId: body.analysisId,
      parsed: resume.parsed,
      jdKeywords,
      jobDescription: analysis.jobDescription,
      bulletIds: body.bulletIds,
    });
  } catch (err) {
    log.error({ err, analysisId: body.analysisId }, 'rewrite_failed');
    captureError(err, { route: 'rewrite', analysisId: body.analysisId });
    return NextResponse.json(
      { error: 'rewrite_failed', detail: (err as Error).message },
      { status: 502 },
    );
  }

  await store.insertRewrite({
    id: result.id,
    analysisId: body.analysisId,
    result,
    ttlMs: TTL_MS,
  });

  log.info(
    {
      rewriteId: result.id,
      analysisId: body.analysisId,
      total: result.summary.totalBullets,
      rewritten: result.summary.rewritten,
      flagged: result.summary.flagged,
      ms: Date.now() - started,
    },
    'rewrite ok',
  );
  return NextResponse.json({ rewriteId: result.id, summary: result.summary });
}
