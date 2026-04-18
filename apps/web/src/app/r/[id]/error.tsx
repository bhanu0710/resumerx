'use client';

import Link from 'next/link';

export default function AnalysisError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        couldn&apos;t load analysis
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Something broke while loading this page.
      </h1>
      {error.digest && (
        <p className="mt-4 font-mono text-xs text-muted-foreground/60">
          ref: {error.digest}
        </p>
      )}
      <div className="mt-6 flex gap-3 text-sm">
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90"
        >
          try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-border px-4 py-2 text-muted-foreground hover:text-foreground"
        >
          start over
        </Link>
      </div>
    </div>
  );
}
