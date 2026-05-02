// We use pdfjs-dist (Mozilla) for text extraction instead of pdf-parse.
// pdf-parse fails on resumes whose embedded fonts use custom CMaps without
// proper space characters (Canva exports, some LaTeX templates, certain Word
// export paths). Symptoms: spaces stripped between words, bullet glyphs
// mojibaked into "%Ï" or "Ø=Ý", text mashed together.
//
// pdfjs-dist returns positioned text items (x, y, width per item) so we can
// reconstruct word boundaries from glyph X-gaps even when the font lacks
// space chars, and it resolves Unicode CMaps correctly so common bullet
// glyphs come through cleanly.
//
// Falls back to pdf-parse if pdfjs throws — defense in depth, since neither
// extractor handles 100% of PDFs.

import pdfParse from 'pdf-parse';
import { resumeId, type ParsedResume } from '@resumerx/shared';
import { structureResume } from './structure.js';

// pdfjs-dist's legacy entry is the Node-friendly one (no DOM/worker required).
// We import lazily so the cold start of routes that don't parse PDFs stays cheap.
type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsCache: PdfjsModule | null = null;
async function getPdfjs(): Promise<PdfjsModule> {
  if (pdfjsCache) return pdfjsCache;
  // dynamic import keeps the heavy worker out of the entrypoint bundle
  const mod = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as PdfjsModule;
  // disable the worker — we run in Node, single-threaded extraction is fine
  // and trying to load a worker file from a Cloud Run container path is fragile.
  (mod as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = '';
  pdfjsCache = mod;
  return mod;
}

export async function parsePdfBuffer(buf: Buffer): Promise<ParsedResume> {
  let rawText: string;
  try {
    rawText = await extractWithPdfjs(buf);
    // If pdfjs returns text that looks degenerate (no spaces, no real words),
    // fall through to pdf-parse — sometimes one library handles a PDF the
    // other can't.
    if (looksDegenerate(rawText)) {
      const fallback = await extractWithPdfParse(buf);
      // Use whichever is less-degenerate
      if (qualityScore(fallback) > qualityScore(rawText)) rawText = fallback;
    }
  } catch {
    rawText = await extractWithPdfParse(buf);
  }

  rawText = normalizeText(rawText);
  if (!rawText.trim()) {
    throw new Error('empty PDF — no extractable text (scanned image?)');
  }
  if (looksDegenerate(rawText)) {
    // Both extractors failed to recover spaces. Tell the user something
    // actionable instead of silently producing garbage downstream.
    throw new Error(
      'PDF text appears garbled (custom font CMap with no space mapping). Re-export the resume with "Embed standard fonts" or save as plain PDF/A.',
    );
  }

  return structureResume(rawText);
}

// pdfjs-dist text extraction with X-gap reconstruction.
//
// Each page yields TextItems with { str, transform: [..,..,..,..,x,y], width }.
// We sort by line (y), then by x within a line, then insert a space between
// adjacent items when the X-gap is bigger than ~30% of the previous item's
// average glyph width. This recovers spaces even when the embedded font has
// no space character and glyphs render as a single positioned item per word.
async function extractWithPdfjs(buf: Buffer): Promise<string> {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    // suppress the verbose "warning" stream pdfjs prints about font fallbacks
    verbosity: 0,
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    // disableNormalization=false lets pdfjs apply its own NFKC normalization
    // (helps with ligatures like "fi" → "f"+"i").
    const content = await page.getTextContent({
      includeMarkedContent: false,
      disableNormalization: false,
    } as Parameters<typeof page.getTextContent>[0]);

    type Item = { str: string; x: number; y: number; w: number; h: number };
    const items: Item[] = [];
    for (const it of content.items as Array<{
      str: string;
      transform?: number[];
      width?: number;
      height?: number;
    }>) {
      if (!it.str) continue;
      const tr = it.transform ?? [1, 0, 0, 1, 0, 0];
      const x = tr[4] ?? 0;
      const y = tr[5] ?? 0;
      const w = it.width ?? tr[0] ?? 0;
      const h = it.height ?? Math.abs(tr[3] ?? 10);
      items.push({ str: it.str, x, y, w, h });
    }

    // group into lines by y (with a small epsilon)
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: Item[][] = [];
    const Y_EPS = 2; // points; lines closer than this are the same baseline
    for (const it of items) {
      const last = lines[lines.length - 1];
      if (last && Math.abs((last[0]?.y ?? 0) - it.y) <= Y_EPS) {
        last.push(it);
      } else {
        lines.push([it]);
      }
    }

    const pageOut: string[] = [];
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      let acc = '';
      let prevEnd = -Infinity;
      let prevH = 10;
      for (const it of line) {
        if (acc !== '') {
          const gap = it.x - prevEnd;
          // word-break threshold: ~25% of glyph height is roughly a space.
          // pdfjs sometimes returns whole words as one item (with a leading
          // space already), sometimes character-by-character. The threshold
          // covers both cases — if pdfjs already gave us a leading space we
          // don't double-insert because str will start with " ".
          const needsSpace =
            gap > Math.max(1.2, prevH * 0.25) && !/^\s/.test(it.str) && !/\s$/.test(acc);
          if (needsSpace) acc += ' ';
        }
        acc += it.str;
        prevEnd = it.x + it.w;
        prevH = it.h || prevH;
      }
      // collapse any leftover internal multispace into single
      pageOut.push(acc.replace(/[ \t]{2,}/g, ' ').trim());
    }
    pages.push(pageOut.filter(Boolean).join('\n'));
  }

  await doc.destroy();
  return pages.join('\n\n');
}

async function extractWithPdfParse(buf: Buffer): Promise<string> {
  const data = await pdfParse(buf);
  return data.text ?? '';
}

// "Degenerate" = the extractor produced text but spaces were stripped.
// Heuristic: most "lines" are huge runs of letters with no spaces, and the
// overall space-to-letter ratio is way below normal English (~16%).
function looksDegenerate(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 50) return false;
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  const spaces = (trimmed.match(/ /g) ?? []).length;
  if (letters === 0) return false;
  const ratio = spaces / letters;
  // English prose usually sits around 0.15–0.20. Below 0.05 is almost
  // certainly broken extraction.
  return ratio < 0.05;
}

function qualityScore(text: string): number {
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const spaces = (text.match(/ /g) ?? []).length;
  if (letters === 0) return 0;
  return spaces / letters;
}

// rawText still has inconsistent whitespace and the occasional weird control
// char. Clean it up.
function normalizeText(text: string): string {
  return (
    text
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, '  ')
      .replace(/\u00a0/g, ' ') // non-breaking space
      // strip control chars except newline
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
      // common bullet-glyph mojibake patterns → real bullet
      .replace(/%Ï\s*/g, '• ')
      .replace(/Ø=Ý\s*/g, '• ')
      .replace(/[\uF000-\uF8FF]/g, '•') // Private Use Area characters → bullet
      .replace(/ {3,}/g, '  ') // collapse runs of spaces but keep 2-space indent
      .replace(/\n{3,}/g, '\n\n') // collapse many blank lines
      .trim()
  );
}

// fresh resumeId is stamped here so parse output includes its own id
export function withResumeId<T extends ParsedResume>(parsed: T): T & { resumeId: string } {
  return { ...parsed, resumeId: resumeId() };
}
