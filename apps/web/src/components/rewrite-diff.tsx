'use client';

import * as React from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import type { BulletRewrite } from '@resumerx/shared';

type Choice = 'original' | 'rewritten';

interface Props {
  rewriteId: string;
  bullets: BulletRewrite[];
  accepted: Record<string, string>;
}

export function RewriteDiff({ rewriteId, bullets, accepted }: Props) {
  // default: rewritten if validation passed AND rewrite differs from original, else original
  const initialChoice = React.useMemo(() => {
    const m: Record<string, Choice> = {};
    for (const b of bullets) {
      const accText = accepted[b.bulletId];
      if (accText === b.rewritten) m[b.bulletId] = 'rewritten';
      else if (accText === b.original) m[b.bulletId] = 'original';
      else {
        m[b.bulletId] =
          b.rewritten !== b.original && b.validation.passed ? 'rewritten' : 'original';
      }
    }
    return m;
  }, [bullets, accepted]);

  const [choice, setChoice] = React.useState<Record<string, Choice>>(initialChoice);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const groups = React.useMemo(() => {
    const m = new Map<string, { label: string; items: BulletRewrite[] }>();
    for (const b of bullets) {
      const key = `${b.section}:${b.parentId}`;
      const prev = m.get(key);
      if (prev) prev.items.push(b);
      else {
        // parentId alone isn't human-readable, so stitch section + parentId;
        // the parent page already shows the real label on the analysis view
        m.set(key, {
          label: b.section === 'experience' ? 'Experience' : 'Projects',
          items: [b],
        });
      }
    }
    return [...m.values()];
  }, [bullets]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const acceptances = bullets.map((b) => ({
        bulletId: b.bulletId,
        finalText: choice[b.bulletId] === 'rewritten' ? b.rewritten : b.original,
      }));
      const res = await fetch(`/api/rewrite/${rewriteId}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ acceptances }),
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      setSavedAt(new Date());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {groups.map((g, gi) => (
        <section key={gi}>
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {g.label}
          </h2>
          <ul className="space-y-4">
            {g.items.map((b) => (
              <BulletCard
                key={b.bulletId}
                bullet={b}
                choice={choice[b.bulletId]}
                onChoose={(c) => setChoice((prev) => ({ ...prev, [b.bulletId]: c }))}
              />
            ))}
          </ul>
        </section>
      ))}

      <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-border/60 bg-card/80 p-4 backdrop-blur">
        <p className="text-sm text-muted-foreground">
          {savedAt ? `saved ${savedAt.toLocaleTimeString()}` : 'unsaved changes'}
          {error && <span className="ml-2 text-destructive">· {error}</span>}
        </p>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'saving…' : 'save choices'}
        </button>
      </div>
    </div>
  );
}

function BulletCard({
  bullet,
  choice,
  onChoose,
}: {
  bullet: BulletRewrite;
  choice: Choice;
  onChoose: (c: Choice) => void;
}) {
  const identical = bullet.rewritten === bullet.original;
  const flagged = !bullet.validation.passed;

  return (
    <li className="rounded-xl border border-border/60 bg-card/40 p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {identical && (
          <span className="rounded-md border border-border/60 bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            skipped
          </span>
        )}
        {flagged && (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            validator flag
          </span>
        )}
        {bullet.keywordsInjected.length > 0 && (
          <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
            kw: {bullet.keywordsInjected.join(', ')}
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Panel
          label="original"
          text={bullet.original}
          selected={choice === 'original'}
          onSelect={() => onChoose('original')}
          tone="neutral"
        />
        <Panel
          label={flagged ? 'rewrite (flagged)' : 'rewrite'}
          text={bullet.rewritten}
          selected={choice === 'rewritten'}
          onSelect={() => onChoose('rewritten')}
          tone={flagged ? 'warn' : 'ok'}
          disabled={identical}
        />
      </div>

      {flagged && (
        <ul className="mt-3 space-y-1 text-xs text-amber-400/90">
          {bullet.validation.flags.map((f, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-mono uppercase tracking-wider">{f.type.replace(/_/g, ' ')}:</span>
              <span className="text-muted-foreground">{f.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {bullet.reasoning && !identical && (
        <p className="mt-3 text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-wider text-foreground/70">why: </span>
          {bullet.reasoning}
        </p>
      )}
    </li>
  );
}

function Panel({
  label,
  text,
  selected,
  onSelect,
  tone,
  disabled,
}: {
  label: string;
  text: string;
  selected: boolean;
  onSelect: () => void;
  tone: 'ok' | 'warn' | 'neutral';
  disabled?: boolean;
}) {
  const ring =
    selected && tone === 'ok'
      ? 'ring-1 ring-primary border-primary/40'
      : selected && tone === 'warn'
        ? 'ring-1 ring-amber-400 border-amber-400/40'
        : selected
          ? 'ring-1 ring-foreground/30 border-foreground/30'
          : 'border-border/60';
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`group flex flex-col rounded-lg border bg-background/40 p-3 text-left transition-colors hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50 ${ring}`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {selected && <Check className="h-3.5 w-3.5 text-primary" />}
      </div>
      <p className="text-sm leading-snug">{text}</p>
    </button>
  );
}
