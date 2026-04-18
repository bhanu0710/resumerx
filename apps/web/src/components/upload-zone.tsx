'use client';

import * as React from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UPLOAD_MAX_BYTES } from '@resumerx/shared';

export function UploadZone({
  file,
  onFile,
  disabled = false,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  disabled?: boolean;
}) {
  const [dragActive, setDragActive] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const pick = (f: File | null) => {
    setErr(null);
    if (!f) return onFile(null);
    if (f.type !== 'application/pdf') {
      setErr('PDFs only for now — DOCX support is on my list.');
      return;
    }
    if (f.size > UPLOAD_MAX_BYTES) {
      setErr(`That file is ${(f.size / 1024 / 1024).toFixed(1)}MB. Max is 5MB.`);
      return;
    }
    onFile(f);
  };

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-label="upload a PDF resume"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          'border-border bg-card/50 group relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors',
          'hover:border-primary/50 hover:bg-accent/30',
          dragActive && 'border-primary bg-accent/40',
          disabled && 'pointer-events-none opacity-50',
          file && 'border-primary/40 bg-accent/20 border-solid',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex items-center gap-3 text-sm">
            <FileText className="text-primary h-5 w-5" />
            <div className="flex flex-col items-start">
              <span className="font-medium">{file.name}</span>
              <span className="text-muted-foreground text-xs">
                {(file.size / 1024).toFixed(0)} KB
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                pick(null);
              }}
              className="text-muted-foreground hover:bg-accent hover:text-foreground ml-2 rounded p-1"
              aria-label="remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <UploadCloud className="text-muted-foreground group-hover:text-primary mb-3 h-6 w-6 transition-colors" />
            <p className="text-sm">
              <span className="font-medium">Drop your resume</span>
              <span className="text-muted-foreground"> or click to upload</span>
            </p>
            <p className="text-muted-foreground mt-1 text-xs">PDF, 5MB max</p>
          </>
        )}
      </div>
      {err && <p className="text-destructive text-sm">{err}</p>}
    </div>
  );
}
