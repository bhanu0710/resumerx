import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

export function SiteHeader() {
  return (
    <header className="border-border/50 bg-background/80 sticky top-0 z-40 w-full border-b backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-mono text-sm">
          <span className="bg-primary inline-block h-2 w-2 rounded-full" />
          resumerx
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/how-ats-works">how ATS works</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="https://github.com/bhanu0710/resumerx" target="_blank" rel="noreferrer">
              github
            </Link>
          </Button>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
