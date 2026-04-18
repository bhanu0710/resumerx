import 'server-only';

// Per-IP sliding-window rate limiter. In-memory only — fine for a single
// Next.js server instance. When we scale horizontally, swap this for Upstash
// Redis keeping the same `check()` shape.

type Bucket = { hits: number[] };
type GlobalWithBuckets = typeof globalThis & { __resumerxRate?: Map<string, Bucket> };
const g = globalThis as GlobalWithBuckets;
const buckets = g.__resumerxRate ?? (g.__resumerxRate = new Map());

export interface RateLimit {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

export function check(key: string, limit: number, windowMs: number): RateLimit {
  const now = Date.now();
  const cutoff = now - windowMs;
  const bucket: Bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    buckets.set(key, bucket);
    return { ok: false, limit, remaining: 0, retryAfterSec };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, limit, remaining: limit - bucket.hits.length, retryAfterSec: 0 };
}

// Next 14's request object doesn't expose IP directly — read standard proxy
// headers, fall back to a stable-enough string so we still bucket dev traffic.
export function ipOf(req: Request): string {
  const h = req.headers;
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? h.get('cf-connecting-ip') ?? 'local';
}

export const LIMITS = {
  uploadUrl: { limit: 20, windowMs: 60_000 }, // 20/min — generous, covers retries
  analyze: { limit: 6, windowMs: 60_000 }, // expensive LLM call
  rewrite: { limit: 4, windowMs: 60_000 }, // even more expensive
} as const;
