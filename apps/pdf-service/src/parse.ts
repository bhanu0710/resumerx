// pdf-parse has a quirky default export when imported via ESM. Wrap it once.
import pdfParse from 'pdf-parse';
import { resumeId, type ParsedResume } from '@resumerx/shared';
import { structureResume } from './structure.js';

export async function parsePdfBuffer(buf: Buffer): Promise<ParsedResume> {
  const data = await pdfParse(buf);
  const rawText = normalizeText(data.text);
  if (!rawText.trim()) {
    throw new Error('empty PDF — no extractable text (scanned image?)');
  }
  return structureResume(rawText);
}

// rawText from pdf-parse has inconsistent whitespace. Clean it up a bit.
function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/\u00a0/g, ' ') // non-breaking space
    .replace(/ {3,}/g, '  ') // collapse runs of spaces but keep 2-space indent
    .replace(/\n{3,}/g, '\n\n') // collapse many blank lines
    .trim();
}

// fresh resumeId is stamped here so parse output includes its own id
export function withResumeId<T extends ParsedResume>(parsed: T): T & { resumeId: string } {
  return { ...parsed, resumeId: resumeId() };
}
