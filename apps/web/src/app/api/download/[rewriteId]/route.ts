import { NextResponse } from 'next/server';
import { getStore } from '@/server/db';
import { renderResume, PdfServiceError, type RenderFormat } from '@/server/pdf-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

function isFormat(f: string | null): f is RenderFormat {
  return f === 'pdf' || f === 'docx';
}

export async function GET(req: Request, { params }: { params: { rewriteId: string } }) {
  const url = new URL(req.url);
  const format = url.searchParams.get('format');
  if (!isFormat(format)) {
    return NextResponse.json(
      { error: 'invalid_format', detail: 'format must be pdf or docx' },
      { status: 400 },
    );
  }

  const store = getStore();
  const rewrite = await store.getRewrite(params.rewriteId);
  if (!rewrite) {
    return NextResponse.json({ error: 'rewrite_not_found' }, { status: 404 });
  }
  const analysis = await store.getAnalysis(rewrite.result.analysisId);
  if (!analysis) {
    return NextResponse.json({ error: 'analysis_not_found' }, { status: 404 });
  }
  const resume = await store.getResume(analysis.resumeId);
  if (!resume) {
    return NextResponse.json({ error: 'resume_not_found' }, { status: 404 });
  }

  // If the user hasn't saved their choices yet, default to the same logic the UI uses:
  // rewritten text when validation passed and differs from original, else original.
  const accepted: Record<string, string> = { ...(rewrite.acceptedBullets ?? {}) };
  for (const b of rewrite.result.bullets) {
    if (accepted[b.bulletId] !== undefined) continue;
    accepted[b.bulletId] =
      b.rewritten !== b.original && b.validation.passed ? b.rewritten : b.original;
  }

  // pdf-service /render only applies `accepted` to bullets. summary + skills
  // rewrites live on rewrite.result.sectionRewrites — merge them into the resume
  // we send to the renderer so the download reflects every rewrite, not just bullets.
  const merged = { ...resume.parsed };
  const sr = rewrite.result.sectionRewrites;
  if (sr?.summary?.rewritten) {
    merged.summary = sr.summary.rewritten;
  }
  if (sr?.skills?.rewritten?.length) {
    merged.skills = { ...merged.skills, technical: sr.skills.rewritten };
  }

  // Final review items are literal-substring fixes (cliché → replacement, weak
  // verb → strong verb, etc). Apply them across summary, accepted bullets, and
  // skills so the download mirrors exactly what the review pane showed.
  const reviewItems = rewrite.result.finalReview?.items ?? [];
  const applyReview = (text: string): string => {
    let out = text;
    for (const it of reviewItems) {
      if (!it.original || it.original === it.replacement) continue;
      if (out.includes(it.original)) out = out.split(it.original).join(it.replacement);
    }
    return out;
  };
  if (reviewItems.length > 0) {
    if (merged.summary) merged.summary = applyReview(merged.summary);
    merged.skills = {
      ...merged.skills,
      technical: merged.skills.technical.map(applyReview),
      tools: merged.skills.tools?.map(applyReview),
      soft: merged.skills.soft?.map(applyReview),
    };
    for (const k of Object.keys(accepted)) {
      accepted[k] = applyReview(accepted[k]);
    }
  }

  try {
    const { bytes, contentType } = await renderResume(merged, accepted, format);
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    return new NextResponse(ab, {
      status: 200,
      headers: {
        'content-type': contentType,
        'content-disposition': `attachment; filename="resume.${format}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    const status = err instanceof PdfServiceError ? 502 : 500;
    return NextResponse.json(
      { error: 'render_failed', detail: (err as Error).message },
      { status },
    );
  }
}
