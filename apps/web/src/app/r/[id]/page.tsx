import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getStore } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// phase 4: minimal stub so the upload → analyze → results flow renders end-to-end.
// phase 5 replaces this with the real analysis UI (scores, issues, keyword match).
export default async function ResultsPage({ params }: { params: { id: string } }) {
  // the example anchor on the landing page links here with id="example"
  if (params.id === 'example') {
    return (
      <div className="container py-16">
        <h1 className="text-2xl font-semibold">example analysis</h1>
        <p className="mt-2 text-muted-foreground">
          this will show a worked example in phase 5. for now, the flow just lands here.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-primary underline-offset-4 hover:underline">
          ← back
        </Link>
      </div>
    );
  }

  const store = getStore();
  const analysis = await store.getAnalysis(params.id);
  if (!analysis) notFound();

  const resume = await store.getResume(analysis.resumeId);

  return (
    <div className="container py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            analysis
          </p>
          <h1 className="text-2xl font-semibold">id: {analysis.id}</h1>
        </div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← home
        </Link>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/40 p-6">
        <h2 className="text-lg font-medium">parsed resume</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          heuristic parse from pdf-service. full analysis lands in phase 5.
        </p>
        {resume ? (
          <dl className="mt-6 grid gap-4 text-sm md:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">name</dt>
              <dd>{resume.parsed.contact.name || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">email</dt>
              <dd>{resume.parsed.contact.email || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">experience roles</dt>
              <dd>{resume.parsed.experience.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">projects</dt>
              <dd>{resume.parsed.projects?.length ?? 0}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-muted-foreground">skills</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {resume.parsed.skills.technical.slice(0, 24).map((s) => (
                  <span key={s} className="rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs">
                    {s}
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">resume row missing — ttl likely expired.</p>
        )}
      </div>
    </div>
  );
}
