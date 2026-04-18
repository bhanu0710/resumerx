import 'server-only';
import { ParsedResumeSchema, type ParsedResume } from '@resumerx/shared';
import { env } from './env';

// typed client for the pdf-service. keeps the route handlers from knowing
// about transport details (fetch, auth header, content-type, etc).

export class PdfServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'PdfServiceError';
  }
}

async function authedFetch(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (env.pdfService.token) {
    headers.set('authorization', `Bearer ${env.pdfService.token}`);
  }
  return fetch(`${env.pdfService.url}${path}`, { ...init, headers });
}

// send the raw PDF bytes — the service parses with pdf-parse + our structure heuristic.
export async function parsePdfBytes(bytes: Buffer, filename = 'resume.pdf'): Promise<ParsedResume> {
  const form = new FormData();
  // copy into a fresh ArrayBuffer so Blob's BlobPart typing is happy across
  // Node's SharedArrayBuffer-union Buffer type
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  form.append('file', new Blob([ab], { type: 'application/pdf' }), filename);

  const res = await authedFetch('/parse', { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new PdfServiceError(`pdf-service /parse failed: ${res.status}`, res.status, text);
  }
  const json = await res.json();
  // validate at the boundary — the service *should* already have validated,
  // but belt-and-braces here means downstream code can trust the type.
  return ParsedResumeSchema.parse(json);
}
