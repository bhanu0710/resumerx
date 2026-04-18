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
        <p className="text-muted-foreground mt-2">
          worked example lands in a later phase. for now, upload your own resume to see the real
          output.
        </p>
        <Link
          href="/"
          className="text-primary mt-6 inline-block text-sm underline-offset-4 hover:underline"
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
          <p className="text-muted-foreground font-mono text-xs uppercase tracking-wider">
            analysis
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {resume?.parsed.contact.name || 'your resume'} vs. this job
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">id: {a.id}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link
            href={`/r/${params.id}/rewrite`}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 font-medium"
          >
            rewrite bullets →
          </Link>
          <Link
            href="/"
            className="border-border text-muted-foreground hover:text-foreground rounded-md border px-4 py-2"
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
        <p className="text-muted-foreground mt-3 text-sm">{a.keywordMatch.densityNote}</p>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-medium">ATS issues ({a.atsIssues.length})</h2>
        {a.atsIssues.length === 0 ? (
          <p className="border-border/60 bg-card/30 text-muted-foreground rounded-lg border p-6 text-sm">
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
            <div key={s.name} className="border-border/60 bg-card/40 rounded-xl border p-5">
              <h3 className="text-base font-medium">{s.name}</h3>
              {s.strengths.length > 0 && <Block label="strengths" items={s.strengths} tone="ok" />}
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
  const tone = value >= 80 ? 'text-primary' : value >= 60 ? 'text-amber-400' : 'text-destructive';
  return (
    <div className="border-border/60 bg-card/40 rounded-xl border p-6">
      <p className="text-muted-foreground font-mono text-xs uppercase tracking-wider">{label}</p>
      <p className={`mt-2 text-4xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <div className="bg-border/40 mt-3 h-1.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary/80 h-full"
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
    <div className="border-border/60 bg-card/40 rounded-xl border p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <p className="text-sm font-medium">{title}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((k) => (
            <li
              key={k}
              className="border-border/60 bg-background rounded-md border px-2 py-0.5 text-xs"
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
    issue.severity === 'high' ? AlertCircle : issue.severity === 'med' ? AlertTriangle : Info;
  const tone =
    issue.severity === 'high'
      ? 'text-destructive'
      : issue.severity === 'med'
        ? 'text-amber-400'
        : 'text-muted-foreground';
  return (
    <li className="border-border/60 bg-card/40 rounded-xl border p-5">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`font-mono text-[10px] uppercase tracking-wider ${tone}`}>
              {issue.severity}
            </span>
            {issue.location && (
              <span className="text-muted-foreground font-mono text-[10px] uppercase tracking-wider">
                · {issue.location}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm">{issue.issue}</p>
          <p className="text-muted-foreground mt-2 text-sm">
            <span className="text-foreground font-medium">fix:</span> {issue.fix}
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
      <ul className="text-muted-foreground space-y-1 text-sm">
        {items.map((it, i) => (
          <li key={i} className="leading-snug">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
