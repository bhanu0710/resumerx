import { NextResponse } from 'next/server';

// phase 4 adds real checks against DB, Redis, pdf-service, Groq
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'web',
    checks: { db: 'skip', redis: 'skip', pdfService: 'skip', groq: 'skip' },
  });
}
