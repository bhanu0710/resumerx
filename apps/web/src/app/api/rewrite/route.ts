import { NextResponse } from 'next/server';
import { RewriteRequestSchema, ARTIFACT_TTL_HOURS } from '@resumerx/shared';
import { getStore } from '@/server/db';
import { runRewrite, selectJdKeywords } from '@/server/rewrite';

export const runtime = 'nodejs';
export const maxDuration = 300;

const TTL_MS = ARTIFACT_TTL_HOURS * 60 * 60 * 1000;

export async function POST(req: Request) {
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
      bulletIds: body.bulletIds,
    });
  } catch (err) {
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

  return NextResponse.json({ rewriteId: result.id, summary: result.summary });
}
