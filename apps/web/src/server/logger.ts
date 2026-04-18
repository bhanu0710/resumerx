import 'server-only';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { env } from './env';

// shared pino instance. pretty in dev, JSON in prod — log aggregators
// (Loki, Datadog) want JSON; a human reading dev output wants colors.
type GlobalWithLogger = typeof globalThis & { __resumerxLogger?: pino.Logger };
const g = globalThis as GlobalWithLogger;

function build(): pino.Logger {
  // Note: we intentionally avoid pino's `transport` option because it spawns
  // a worker thread that Next.js's hot-reload keeps killing in dev. Plain
  // JSON to stdout works in both dev and prod — aggregators want JSON anyway,
  // and `| pino-pretty` at the shell handles dev readability.
  return pino({
    level: process.env.LOG_LEVEL ?? (env.isProd ? 'info' : 'debug'),
    base: { service: 'resumerx-web' },
  });
}

export const logger: pino.Logger = g.__resumerxLogger ?? (g.__resumerxLogger = build());

// one correlation id per request — attached to the request-scoped child logger
// so every log line about a given request shares the same rid.
export function requestId(req?: Request): string {
  const fromHeader = req?.headers.get('x-request-id');
  return fromHeader && fromHeader.length > 0 ? fromHeader : randomUUID();
}

export function forRequest(req: Request, extra: Record<string, unknown> = {}): pino.Logger {
  return logger.child({
    rid: requestId(req),
    path: new URL(req.url).pathname,
    method: req.method,
    ...extra,
  });
}
