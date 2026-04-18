export default function RewriteLoading() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <div className="bg-primary h-2 w-2 animate-pulse rounded-full" />
      <p className="text-muted-foreground mt-6 font-mono text-xs uppercase tracking-wider">
        rewriting
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Working through your bullets</h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        Rewriter proposes. Validator checks for fabrication. Takes 10–30 seconds for a typical
        resume — don&apos;t refresh.
      </p>
    </div>
  );
}
