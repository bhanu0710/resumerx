'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, FileText, Wand2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UploadZone } from '@/components/upload-zone';
import { JdInput } from '@/components/jd-input';
import { JD_MIN_LENGTH } from '@resumerx/shared';

export default function LandingPage() {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [jd, setJd] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const canSubmit =
    file !== null && !submitting && jd.length >= JD_MIN_LENGTH;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !file) return;
    setSubmitting(true);
    setError(null);
    try {
      const presignRes = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/pdf',
          size: file.size,
        }),
      });
      if (!presignRes.ok) throw new Error(`upload-url ${presignRes.status}`);
      const { resumeId, uploadUrl } = await presignRes.json();

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type || 'application/pdf' },
        body: file,
      });
      if (!putRes.ok) throw new Error(`upload ${putRes.status}`);

      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resumeId, jobDescription: jd }),
      });
      if (!analyzeRes.ok) {
        const body = await analyzeRes.json().catch(() => ({}));
        throw new Error(body.detail || `analyze ${analyzeRes.status}`);
      }
      const { analysisId } = await analyzeRes.json();
      router.push(`/r/${analysisId}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* hero + upload */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="bg-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background" aria-hidden />
        <div className="container relative grid gap-10 py-16 md:grid-cols-[1.1fr_1fr] md:gap-16 md:py-24">
          <div className="flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 animate-subtle-pulse rounded-full bg-primary" />
              no fabrication — validator LLM catches added facts
            </div>
            <h1 className="text-pretty text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
              Upload your resume. See what&apos;s actually wrong with it.
            </h1>
            <p className="mt-5 max-w-xl text-balance text-lg text-muted-foreground">
              Tailor it to the job — without making things up. Every rewritten bullet is checked
              against your original, so nothing sneaks in that you didn&apos;t do.
            </p>
            <div className="mt-6 flex items-center gap-4 text-sm text-muted-foreground">
              <Link
                href="/r/example"
                className="group inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
              >
                see an example analysis
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <span className="hidden md:inline">·</span>
              <span className="hidden md:inline">auto-deleted after 24h</span>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 rounded-xl border border-border bg-card/60 p-5 shadow-sm md:p-6"
          >
            <UploadZone file={file} onFile={setFile} disabled={submitting} />
            <JdInput value={jd} onChange={setJd} disabled={submitting} />
            <Button type="submit" size="lg" disabled={!canSubmit}>
              {submitting ? 'analyzing…' : 'analyze my resume'}
              {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
            {error && (
              <p className="text-center text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
            <p className="text-center text-xs text-muted-foreground">
              free · no signup · resume stays on R2 for 24h, then gone
            </p>
          </form>
        </div>
      </section>

      {/* how it works — tight 3 steps, not a marketing brochure */}
      <section className="border-b border-border/50 py-16 md:py-20">
        <div className="container">
          <div className="mb-10 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                how it works
              </p>
              <h2 className="text-3xl font-semibold tracking-tight">Three steps. That&apos;s it.</h2>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Step
              index="01"
              icon={<FileText className="h-4 w-4" />}
              title="Parse your resume"
              body="We extract the structure — roles, bullets, skills, dates. No LLM at this stage so the meaning stays yours."
            />
            <Step
              index="02"
              icon={<Wand2 className="h-4 w-4" />}
              title="Analyze + rewrite"
              body="Score ATS compatibility. Find keyword gaps vs the job description. Rewrite bullets, one at a time, with stronger verbs and earned keywords only."
            />
            <Step
              index="03"
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Validator pass"
              body="A second model checks every rewrite against the original. If it added a number, a tool, or exaggerated scope — the rewrite is flagged and you see the original instead."
            />
          </div>
        </div>
      </section>

      {/* what it won't do — the counter-positioning that makes this trustworthy */}
      <section className="border-b border-border/50 py-16 md:py-20">
        <div className="container max-w-3xl">
          <p className="mb-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            the deal
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">What it won&apos;t do.</h2>
          <p className="mt-3 text-muted-foreground">
            Most AI resume tools will happily invent a 40% improvement metric or add &ldquo;led a team
            of 8&rdquo; when your bullet said &ldquo;worked with the team.&rdquo; That&apos;s how
            people get caught in interviews. Here are the guardrails.
          </p>
          <ul className="mt-8 grid gap-x-6 gap-y-3 md:grid-cols-2">
            {REFUSALS.map((r) => (
              <li key={r} className="flex gap-3 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

function Step({
  index,
  icon,
  title,
  body,
}: {
  index: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="group relative rounded-xl border border-border/60 bg-card/40 p-5 transition-colors hover:border-primary/30 hover:bg-card/70">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">{index}</span>
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground group-hover:text-primary">
          {icon}
        </div>
      </div>
      <h3 className="text-base font-medium">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

const REFUSALS = [
  "No fabricated numbers. If your bullet had no metric, the rewrite won't invent one.",
  "No added tools. Won't pretend you used Kubernetes if your resume only said Docker.",
  "No exaggerated scope. 'Contributed to' doesn't become 'led' without proof.",
  "Length stays close. Rewrites are ±20% of the original, no padding.",
  "Keywords only if earned. JD keywords get woven in only where your actual work matches.",
  "Validator has veto power. Flagged rewrites are discarded — you see the original.",
];
