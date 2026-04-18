import 'server-only';
import { env } from './env';
import { logger } from './logger';

// Conditional Sentry wrapper. If SENTRY_DSN is unset (dev, CI, local preview),
// this no-ops so we don't send anything. Routes call captureError() in their
// error paths; they don't need to know whether Sentry is active.

type Sentry = typeof import('@sentry/node');
let sentry: Sentry | null = null;

if (process.env.SENTRY_DSN) {
  // init lazily so tests and stub runs don't pay the require cost
  import('@sentry/node')
    .then((s) => {
      s.init({
        dsn: process.env.SENTRY_DSN,
        environment: env.isProd ? 'production' : 'development',
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
      });
      sentry = s;
      logger.info('sentry initialized');
    })
    .catch((err) => logger.warn({ err }, 'sentry init failed — continuing without'));
}

export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  if (sentry) {
    sentry.withScope((scope) => {
      for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
      sentry!.captureException(err);
    });
  }
}
