import { describe, it, expect, beforeEach } from 'vitest';
import { check, ipOf } from './rate-limit';

function freshKey(): string {
  return `test-${Math.random().toString(36).slice(2)}`;
}

describe('rate-limit.check', () => {
  it('allows up to the limit, then blocks with a retry-after', () => {
    const key = freshKey();
    for (let i = 0; i < 3; i++) {
      const r = check(key, 3, 60_000);
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(2 - i);
    }
    const blocked = check(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(blocked.remaining).toBe(0);
  });

  it('releases a slot once the window slides past an old hit', async () => {
    const key = freshKey();
    expect(check(key, 1, 50).ok).toBe(true);
    expect(check(key, 1, 50).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 70));
    expect(check(key, 1, 50).ok).toBe(true);
  });

  it('buckets are per-key — one user blocked does not block another', () => {
    const a = freshKey();
    const b = freshKey();
    expect(check(a, 1, 60_000).ok).toBe(true);
    expect(check(a, 1, 60_000).ok).toBe(false);
    expect(check(b, 1, 60_000).ok).toBe(true);
  });
});

describe('ipOf', () => {
  function req(headers: Record<string, string>): Request {
    return new Request('http://localhost/x', { headers });
  }

  it('prefers x-forwarded-for first entry', () => {
    expect(ipOf(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip, then cf-connecting-ip, then "local"', () => {
    expect(ipOf(req({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
    expect(ipOf(req({ 'cf-connecting-ip': '8.8.8.8' }))).toBe('8.8.8.8');
    expect(ipOf(req({}))).toBe('local');
  });
});
