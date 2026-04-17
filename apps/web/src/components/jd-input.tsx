'use client';

import { JD_MIN_LENGTH, JD_MAX_LENGTH } from '@resumerx/shared';
import { cn } from '@/lib/utils';

export function JdInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const len = value.length;
  const tooShort = len > 0 && len < JD_MIN_LENGTH;
  const tooLong = len > JD_MAX_LENGTH;

  return (
    <div className="space-y-2">
      <label htmlFor="jd" className="block text-sm font-medium">
        Job description <span className="text-muted-foreground">— optional but recommended</span>
      </label>
      <textarea
        id="jd"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={8}
        placeholder="Paste the job posting here. The more detail, the better the keyword matching."
        className={cn(
          'w-full resize-y rounded-lg border border-input bg-card/50 px-3 py-2 text-sm',
          'placeholder:text-muted-foreground',
          'focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30',
          (tooShort || tooLong) && 'border-destructive/60 focus:border-destructive focus:ring-destructive/20',
          'disabled:opacity-50',
        )}
        maxLength={JD_MAX_LENGTH + 500}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {tooShort && `min ${JD_MIN_LENGTH} chars`}
          {tooLong && `over limit — trim to ${JD_MAX_LENGTH}`}
          {!tooShort && !tooLong && 'skip if you just want ATS feedback'}
        </span>
        <span className={cn(tooLong && 'text-destructive')}>
          {len.toLocaleString()} / {JD_MAX_LENGTH.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
