import { redirect, notFound } from 'next/navigation';
import { getStore } from '@/server/db';
import { runRewrite, selectJdKeywords } from '@/server/rewrite';
import { ARTIFACT_TTL_HOURS } from '@resumerx/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// This page kicks off the rewrite (server-side) and then redirects to /rw/[rewriteId].
// Doing it as a server component keeps the link clickable from the analysis page
// without needing a client-side "loading" state — the browser just waits on the redirect.
export default async function RewriteKickoff({ params }: { params: { id: string } }) {
  const store = getStore();
  const analysis = await store.getAnalysis(params.id);
  if (!analysis) notFound();

  // Idempotent: if we already rewrote this analysis, jump straight to the result.
  // Protects against refreshing /r/[id]/rewrite and re-running 30s of LLM work.
  const existing = await store.findRewriteByAnalysisId(params.id);
  if (existing) redirect(`/rw/${existing.id}`);

  const resume = await store.getResume(analysis.resumeId);
  if (!resume) notFound();

  const TTL_MS = ARTIFACT_TTL_HOURS * 60 * 60 * 1000;
  const result = await runRewrite({
    analysisId: params.id,
    parsed: resume.parsed,
    jdKeywords: selectJdKeywords(analysis.result.keywordMatch),
    jobDescription: analysis.jobDescription,
    analysis: analysis.result,
  });
  await store.insertRewrite({
    id: result.id,
    analysisId: params.id,
    result,
    ttlMs: TTL_MS,
  });

  redirect(`/rw/${result.id}`);
}
