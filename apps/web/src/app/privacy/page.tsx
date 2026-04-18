export const metadata = {
  title: 'Privacy — resumerx',
  description: 'What happens to your resume data.',
};

export default function PrivacyPage() {
  return (
    <article className="container max-w-2xl py-16 md:py-20">
      <h1 className="text-4xl font-semibold tracking-tight">Privacy.</h1>
      <p className="text-muted-foreground mt-4 text-lg">
        Short version: your resume is stored briefly so the tool can work, then it&apos;s deleted.
        No training on your data. No accounts, no tracking.
      </p>

      <div className="mt-10 space-y-6 text-sm">
        <Row label="What's stored">
          Uploaded PDF + the parsed structure + any rewrites you generate. Stored in Cloudflare R2
          and Neon Postgres.
        </Row>
        <Row label="How long">
          24 hours. Then it&apos;s deleted automatically — R2 lifecycle rules drop the object,
          Postgres rows get pruned.
        </Row>
        <Row label="Who sees it">
          The Groq API sees the parts needed for analysis and rewrite. Groq&apos;s policy says they
          don&apos;t train on API inputs. I don&apos;t share your data with anyone else.
        </Row>
        <Row label="Tracking">None. No analytics script, no pixels, no session recording.</Row>
        <Row label="Accounts">
          There aren&apos;t any. Don&apos;t upload anything you&apos;d be upset losing.
        </Row>
        <Row label="Source">
          Open source at{' '}
          <a
            href="https://github.com/bhanu0710/resumerx"
            className="text-foreground underline-offset-4 hover:underline"
          >
            github.com/bhanu0710/resumerx
          </a>
          . Audit anything.
        </Row>
      </div>
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 md:grid-cols-[160px_1fr] md:gap-6">
      <div className="text-muted-foreground font-mono text-xs uppercase tracking-wider">
        {label}
      </div>
      <div className="text-foreground/90">{children}</div>
    </div>
  );
}
