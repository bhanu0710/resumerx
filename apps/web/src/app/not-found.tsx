import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="container flex flex-col items-center justify-center py-32 text-center">
      <p className="text-muted-foreground font-mono text-xs uppercase tracking-wider">404</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Page not found.</h1>
      <p className="text-muted-foreground mt-2">
        Not sure what you were looking for, but it isn&apos;t here.
      </p>
      <Button asChild className="mt-6" variant="outline">
        <Link href="/">back to home</Link>
      </Button>
    </div>
  );
}
