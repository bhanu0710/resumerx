'use client';

import Link from 'next/link';

export default function RewriteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="text-muted-foreground font-mono text-xs uppercase tracking-wider">
        rewrite failed
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Something went wrong on our end.
      </h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        The rewriter or validator couldn&apos;t finish. Your analysis is still saved — try again, or
        head back to the results page.
      </p>
      {error.digest && (
        <p className="text-muted-foreground/60 mt-4 font-mono text-xs">ref: {error.digest}</p>
      )}
      <div className="mt-6 flex gap-3 text-sm">
        <button
          onClick={reset}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 font-medium"
        >
          try again
        </button>
        <Link
          href="/"
          className="border-border text-muted-foreground hover:text-foreground rounded-md border px-4 py-2"
        >
          start over
        </Link>
      </div>
    </div>
  );
}
