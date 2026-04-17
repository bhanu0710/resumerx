import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

const TOKEN = process.env.PDF_SERVICE_TOKEN ?? '';

if (!TOKEN && process.env.NODE_ENV === 'production') {
  throw new Error('PDF_SERVICE_TOKEN must be set in production');
}

export function requireToken(req: FastifyRequest, reply: FastifyReply, done: () => void) {
  const header = req.headers.authorization ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!TOKEN) {
    // dev mode: allow missing token but log it
    req.log.warn('PDF_SERVICE_TOKEN not set, skipping auth (dev only)');
    return done();
  }

  if (!provided) {
    reply.code(401).send({ error: 'missing bearer token' });
    return;
  }

  // constant-time compare to prevent timing oracle on the token
  const a = Buffer.from(provided);
  const b = Buffer.from(TOKEN);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    reply.code(403).send({ error: 'invalid token' });
    return;
  }

  done();
}
