import { NextResponse } from 'next/server';
import { getStore } from '@/server/db';

export const runtime = 'nodejs';

// Deletes the cached rewrite for this analysis so the next visit to
// /r/[id]/rewrite triggers a fresh run with the current prompts.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { analysisId?: string } | null;
  if (!body?.analysisId) {
    return NextResponse.json({ error: 'missing_analysis_id' }, { status: 400 });
  }
  const store = getStore();
  const existing = await store.findRewriteByAnalysisId(body.analysisId);
  if (existing) {
    await store.deleteRewrite(existing.id);
  }
  return NextResponse.json({ ok: true, deleted: existing?.id ?? null });
}
