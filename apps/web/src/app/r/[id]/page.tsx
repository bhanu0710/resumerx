import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { getStore } from '@/server/db';
import type { Analysis, ATSIssue } from '@resumerx/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ResultsPage({ params }: { params: { id: string } }) {
  if (params.id === 'example') {
    return (
      <div className="container py-16">
        <h1 className="text-2xl font-semibold">example analysis</h1>
        <p className="mt-2 text-muted-foreground">
          worked example lands in a later phase. for now, upload your own resume to see the real
          output.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-primary underline-offset-4 hover:underline"
        >
          ← back
        </Link>
      </div>
    );
  }

  const store = getStore();
  const row = await store.getAnalysis(params.id);
  if (!row) notFound();

  const resume = await store.getResume(row.resumeId);
  const a: Analysis = row.result;

  return (
    <div className="container py-10 md:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            analysis
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {resume?.parsed.contact.name || 'your resume'} vs. this job
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">id: {a.id}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link
            href={`/r/${params.id}/rewrite`}
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90"
          >
            rewrite bullets →
          </Link>
          <Link
            href="/"
            className="rounded-md border border-border px-4 py-2 text-muted-foreground hover:text-foreground"
          >
            new analysis
          </Link>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <ScoreCard label="overall" value={a.overallScore} />
        <ScoreCard label="ats compatibility" value={a.atsScore} />
        <ScoreCard label="keyword match" value={a.keywordMatch.score} />
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-medium">keyword match</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <KeywordPanel
            tone="ok"
            title={`matched (${a.keywordMatch.matched.length})`}
            items={a.keywordMatch.matched}
            emptyLabel="no keywords matched"
          />
          <KeywordPanel
            tone="warn"
            title={`missing (${a.keywordMatch.missing.length})`}
            items={a.keywordMatch.missing}
            emptyLabel="nothing missing — good coverage"
          />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{a.keywordMatch.densityNote}</p>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-medium">ATS issues ({a.atsIssues.length})</h2>
        {a.atsIssues.length === 0 ? (
          <p className="rounded-lg border border-border/60 bg-card/30 p-6 text-sm text-muted-foreground">
            no ATS issues detected.
          </p>
        ) : (
          <ul className="space-y-3">
            {a.atsIssues.map((issue, i) => (
              <IssueRow key={i} issue={issue} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-medium">section feedback</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {a.sections.map((s) => (
            <div
              key={s.name}
              className="rounded-xl border border-border/60 bg-card/40 p-5"
            >
              <h3 className="text-base font-medium">{s.name}</h3>
              {s.strengths.length > 0 && (
                <Block label="strengths" items={s.strengths} tone="ok" />
              )}
              {s.weaknesses.length > 0 && (
                <Block label="weaknesses" items={s.weaknesses} tone="warn" />
              )}
              {s.suggestions.length > 0 && (
                <Block label="suggestions" items={s.suggestions} tone="info" />
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  const tone =
    value >= 80
      ? 'text-primary'
      : value >= 60
        ? 'text-amber-400'
        : 'text-destructive';
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-6">
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-2 text-4xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border/40">
        <div
          className="h-full bg-primary/80"
          style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function KeywordPanel({
  tone,
  title,
  items,
  emptyLabel,
}: {
  tone: 'ok' | 'warn';
  title: string;
  items: string[];
  emptyLabel: string;
}) {
  const dot = tone === 'ok' ? 'bg-primary' : 'bg-amber-400';
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <p className="text-sm font-medium">{title}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((k) => (
            <li
              key={k}
              className="rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs"
            >
              {k}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: ATSIssue }) {
  const Icon =
    issue.severity === 'high'
      ? AlertCircle
      : issue.severity === 'med'
        ? AlertTriangle
        : Info;
  const tone =
    issue.severity === 'high'
      ? 'text-destructive'
      : issue.severity === 'med'
        ? 'text-amber-400'
        : 'text-muted-foreground';
  return (
    <li className="rounded-xl border border-border/60 bg-card/40 p-5">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`font-mono text-[10px] uppercase tracking-wider ${tone}`}>
              {issue.severity}
            </span>
            {issue.location && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                · {issue.location}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm">{issue.issue}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">fix:</span> {issue.fix}
          </p>
        </div>
      </div>
    </li>
  );
}

function Block({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: 'ok' | 'warn' | 'info';
}) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : Info;
  const color =
    tone === 'ok' ? 'text-primary' : tone === 'warn' ? 'text-amber-400' : 'text-muted-foreground';
  return (
    <div className="mt-4">
      <div className={`mb-1.5 flex items-center gap-1.5 text-xs ${color}`}>
        <Icon className="h-3 w-3" />
        <span className="font-mono uppercase tracking-wider">{label}</span>
      </div>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {items.map((it, i) => (
          <li key={i} className="leading-snug">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
