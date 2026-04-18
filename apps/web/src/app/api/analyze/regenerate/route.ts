import { NextResponse } from 'next/server';
import { analysisId as newAnalysisId, ARTIFACT_TTL_HOURS } from '@resumerx/shared';
import { getStore } from '@/server/db';
import { runAnalysis } from '@/server/analyze';
import { forRequest } from '@/server/logger';
import { captureError } from '@/server/sentry';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TTL_MS = ARTIFACT_TTL_HOURS * 60 * 60 * 1000;

// Re-runs analysis on the same (resume, jd) pair. Deletes the old analysis
// (and any cached rewrites derived from it) so the returned id is the only
// live one for this pair. Client redirects to /r/[newId].
export async function POST(req: Request) {
  const log = forRequest(req);
  const body = (await req.json().catch(() => null)) as { analysisId?: string } | null;
  if (!body?.analysisId) {
    return NextResponse.json({ error: 'missing_analysis_id' }, { status: 400 });
  }

  const store = getStore();
  const existing = await store.getAnalysis(body.analysisId);
  if (!existing) {
    return NextResponse.json({ error: 'analysis_not_found' }, { status: 404 });
  }
  const resume = await store.getResume(existing.resumeId);
  if (!resume) {
    return NextResponse.json({ error: 'resume_not_found' }, { status: 404 });
  }

  const id = newAnalysisId();
  try {
    const out = await runAnalysis({
      analysisId: id,
      parsed: resume.parsed,
      jobDescription: existing.jobDescription,
    });
    await store.insertAnalysis({
      id,
      resumeId: existing.resumeId,
      jobDescription: existing.jobDescription,
      result: out.analysis,
      ttlMs: TTL_MS,
    });
    await store.deleteAnalysis(body.analysisId);
    return NextResponse.json({ ok: true, analysisId: id });
  } catch (err) {
    log.error({ err }, 'analysis_regenerate_failed');
    captureError(err, { route: 'analyze/regenerate', analysisId: body.analysisId });
    return NextResponse.json(
      { error: 'analysis_failed', detail: (err as Error).message },
      { status: 502 },
    );
  }
}
