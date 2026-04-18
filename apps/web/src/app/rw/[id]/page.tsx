import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getStore } from '@/server/db';
import { RewriteDiff } from '@/components/rewrite-diff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function RewritePage({ params }: { params: { id: string } }) {
  const store = getStore();
  const row = await store.getRewrite(params.id);
  if (!row) notFound();

  const r = row.result;
  const groupedByParent = new Map<string, typeof r.bullets>();
  for (const b of r.bullets) {
    const key = `${b.section}:${b.parentId}`;
    const arr = groupedByParent.get(key) ?? [];
    arr.push(b);
    groupedByParent.set(key, arr);
  }

  return (
    <div className="container py-10 md:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground font-mono text-xs uppercase tracking-wider">
            rewrite
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">bullet-by-bullet</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {r.summary.totalBullets} bullets · {r.summary.rewritten} rewritten · {r.summary.skipped}{' '}
            skipped · {r.summary.flagged} flagged by validator
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <a
            href={`/api/download/${r.id}?format=pdf`}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 font-medium"
          >
            download .pdf
          </a>
          <a
            href={`/api/download/${r.id}?format=docx`}
            className="border-border hover:border-foreground/40 rounded-md border px-4 py-2 font-medium"
          >
            download .docx
          </a>
          <Link
            href={`/r/${r.analysisId}`}
            className="border-border text-muted-foreground hover:text-foreground rounded-md border px-4 py-2"
          >
            ← back
          </Link>
        </div>
      </div>

      {r.summary.flagged > 0 && (
        <div className="mb-6 rounded-lg border border-amber-400/30 bg-amber-400/5 p-4 text-sm">
          <p className="font-medium text-amber-400">
            {r.summary.flagged} rewrite{r.summary.flagged === 1 ? '' : 's'} flagged by validator
          </p>
          <p className="text-muted-foreground mt-1">
            The validator caught things the rewriter shouldn&apos;t have added. For those, the
            original is selected by default — you can still override, but read the flag first.
          </p>
        </div>
      )}

      <RewriteDiff rewriteId={r.id} bullets={r.bullets} accepted={row.acceptedBullets ?? {}} />
    </div>
  );
}
