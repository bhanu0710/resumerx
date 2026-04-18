import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { UPLOAD_MAX_BYTES, ParsedResumeSchema } from '@resumerx/shared';
import { parsePdfBuffer } from './parse.js';
import { fetchR2Object } from './r2.js';
import { requireToken } from './auth.js';
import { renderPdf, renderDocx, applyAccepted } from './render.js';

const PORT = Number.parseInt(process.env.PORT ?? '3001', 10);

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    // pino-pretty only in dev, JSON in prod — keep logs machine-readable
    ...(process.env.NODE_ENV !== 'production' && {
      transport: { target: 'pino-pretty', options: { colorize: true } },
    }),
  },
  bodyLimit: UPLOAD_MAX_BYTES + 1024,
  trustProxy: true,
});

await app.register(multipart, {
  limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
});

// health doesn't require auth
app.get('/health', async () => ({ status: 'ok', service: 'pdf-service' }));

// /parse — accepts either { r2Key: string } JSON OR multipart file upload
const ParseBodySchema = z.object({ r2Key: z.string().min(1) });

app.post('/parse', { preHandler: requireToken }, async (req, reply) => {
  let buffer: Buffer | null = null;

  const contentType = req.headers['content-type'] ?? '';

  try {
    if (contentType.includes('multipart/form-data')) {
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: 'no file uploaded' });
      buffer = await file.toBuffer();
    } else {
      const parsed = ParseBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'body must include r2Key' });
      }
      buffer = await fetchR2Object(parsed.data.r2Key);
    }

    if (!buffer || buffer.length === 0) {
      return reply.code(400).send({ error: 'empty file' });
    }

    // sanity: confirm it's actually a PDF by magic bytes
    if (buffer.subarray(0, 4).toString() !== '%PDF') {
      return reply.code(400).send({ error: 'not a PDF' });
    }

    const parsed = await parsePdfBuffer(buffer);

    // validate our own output before returning — catches structure bugs
    const validated = ParsedResumeSchema.parse(parsed);
    return reply.send(validated);
  } catch (err) {
    req.log.error({ err }, 'parse failed');
    const message = err instanceof Error ? err.message : 'unknown parse error';
    return reply.code(500).send({ error: message });
  }
});

// /render-pdf and /render-docx — accept { resume: ParsedResume, accepted?: Record<string,string> }
const RenderBodySchema = z.object({
  resume: ParsedResumeSchema,
  accepted: z.record(z.string()).optional(),
});

app.post('/render-pdf', { preHandler: requireToken }, async (req, reply) => {
  const parsed = RenderBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid body', detail: parsed.error.flatten() });
  }
  try {
    const merged = applyAccepted(parsed.data.resume, parsed.data.accepted);
    const buf = await renderPdf(merged);
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', 'attachment; filename="resume.pdf"')
      .send(buf);
  } catch (err) {
    req.log.error({ err }, 'render-pdf failed');
    return reply.code(500).send({ error: (err as Error).message });
  }
});

app.post('/render-docx', { preHandler: requireToken }, async (req, reply) => {
  const parsed = RenderBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid body', detail: parsed.error.flatten() });
  }
  try {
    const merged = applyAccepted(parsed.data.resume, parsed.data.accepted);
    const buf = await renderDocx(merged);
    return reply
      .header(
        'content-type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
      .header('content-disposition', 'attachment; filename="resume.docx"')
      .send(buf);
  } catch (err) {
    req.log.error({ err }, 'render-docx failed');
    return reply.code(500).send({ error: (err as Error).message });
  }
});

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// graceful shutdown — fly.io and k8s send SIGTERM
const close = async (signal: string) => {
  app.log.info(`${signal} received, closing`);
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => close('SIGTERM'));
process.on('SIGINT', () => close('SIGINT'));
