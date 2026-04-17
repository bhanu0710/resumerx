import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-border/50 py-8">
      <div className="container flex flex-col items-start justify-between gap-4 text-sm text-muted-foreground md:flex-row md:items-center">
        <p>
          resumerx — open source at{' '}
          <Link
            href="https://github.com/bhanu0710/resumerx"
            className="text-foreground underline-offset-4 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            github
          </Link>
        </p>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-foreground">
            privacy
          </Link>
          <Link href="/how-ats-works" className="hover:text-foreground">
            how ATS works
          </Link>
          <span className="hidden text-xs md:inline">
            resumes auto-deleted after 24h · no training on your data
          </span>
        </div>
      </div>
    </footer>
  );
}
