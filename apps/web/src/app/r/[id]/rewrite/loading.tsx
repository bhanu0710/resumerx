export default function RewriteLoading() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      <p className="mt-6 font-mono text-xs uppercase tracking-wider text-muted-foreground">
        rewriting
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Working through your bullets
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Rewriter proposes. Validator checks for fabrication. Takes 10–30 seconds
        for a typical resume — don&apos;t refresh.
      </p>
    </div>
  );
}
