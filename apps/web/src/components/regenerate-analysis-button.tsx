'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RegenerateAnalysisButton({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/analyze/regenerate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ analysisId }),
      });
      const j = (await res.json().catch(() => ({}))) as { analysisId?: string; error?: string };
      if (!res.ok || !j.analysisId) {
        throw new Error(j.error ?? `http ${res.status}`);
      }
      router.push(`/r/${j.analysisId}`);
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
        {busy ? 'regenerating…' : 'regenerate analysis'}
      </button>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </>
  );
}
