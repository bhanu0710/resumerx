'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RegenerateButton({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/rewrite/regenerate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ analysisId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `http ${res.status}`);
      }
      router.push(`/r/${analysisId}/rewrite`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="border-border hover:border-foreground/40 rounded-md border px-4 py-2 font-medium disabled:opacity-60"
      >
        {busy ? 'regenerating…' : 'regenerate'}
      </button>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </>
  );
}
