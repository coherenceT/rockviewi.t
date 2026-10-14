import { describe, expect, it, vi } from 'vitest';
import { consumeRateLimit, peekRateLimit, rateLimitHeaders, retryAfterSeconds } from '../../worker/lib/rateLimit';
import { FakeKV } from '../helpers/fakes';

const LIMIT = 5;
const WINDOW = 3600;

describe('peekRateLimit', () => {
  it('allows the first request without spending quota', async () => {
    const kv = new FakeKV();
    const result = await peekRateLimit(kv.asKVNamespace(), 'ip:abc', LIMIT, WINDOW);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(LIMIT);

    // Peeking again must still report the full allowance.
    const again = await peekRateLimit(kv.asKVNamespace(), 'ip:abc', LIMIT, WINDOW);
    expect(again.remaining).toBe(LIMIT);
  });

  it('reports the remaining allowance after quota is spent', async () => {
    const kv = new FakeKV();
    await consumeRateLimit(kv.asKVNamespace(), 'ip:abc', LIMIT, WINDOW);
    await consumeRateLimit(kv.asKVNamespace(), 'ip:abc', LIMIT, WINDOW);

    const peeked = await peekRateLimit(kv.asKVNamespace(), 'ip:abc', LIMIT, WINDOW);
    expect(peeked.allowed).toBe(true);
    expect(peeked.remaining).toBe(LIMIT - 2);
  });

  it('stops allowing once the limit is reached', async () => {
    const kv = new FakeKV();
    for (let index = 0; index < LIMIT; index += 1) {
      await consumeRateLimit(kv.asKVNamespace(), 'ip:abc', LIMIT, WINDOW);
    }
    const peeked = await peekRateLimit(kv.asKVNamespace(), 'ip:abc', LIMIT, WINDOW);
    expect(peeked.allowed).toBe(false);
    expect(peeked.remaining).toBe(0);
  });

  it('does not spend quota when the binding is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await peekRateLimit(undefined, 'ip:abc', LIMIT, WINDOW);
    warn.mockRestore();
    expect(result.unavailable).toBe(true);
    expect(result.allowed).toBe(true);
  });
});

describe('consumeRateLimit', () => {
  it('allows exactly the configured number of attempts in a window', async () => {
    const kv = new FakeKV();
    const results = [];
    for (let index = 0; index < LIMIT + 2; index += 1) {
      results.push(await consumeRateLimit(kv.asKVNamespace(), 'ip:abc', LIMIT, WINDOW));
    }

    expect(results.filter((result) => result.allowed)).toHaveLength(LIMIT);
    expect(results.slice(LIMIT).every((result) => !result.allowed)).toBe(true);
    // Five submissions per hour is the policy from the brief.
    expect(LIMIT).toBe(5);
  });

  it('counts each IP separately', async () => {
    const kv = new FakeKV();
    for (let index = 0; index < LIMIT; index += 1) {
      await consumeRateLimit(kv.asKVNamespace(), 'ip:one', LIMIT, WINDOW);
    }
    const other = await consumeRateLimit(kv.asKVNamespace(), 'ip:two', LIMIT, WINDOW);
    expect(other.allowed).toBe(true);
    expect(other.remaining).toBe(LIMIT - 1);
  });

  it('resets once the window has expired', async () => {
    const kv = new FakeKV();
    for (let index = 0; index < LIMIT; index += 1) {
      await consumeRateLimit(kv.asKVNamespace(), 'ip:abc', LIMIT, WINDOW);
    }
    expect((await peekRateLimit(kv.asKVNamespace(), 'ip:abc', LIMIT, WINDOW)).allowed).toBe(false);

    kv.expireNow();

    const afterReset = await consumeRateLimit(kv.asKVNamespace(), 'ip:abc', LIMIT, WINDOW);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(LIMIT - 1);
  });

  it('survives a KV read failure without blocking the applicant', async () => {
    const broken = {
      get: async () => {
        throw new Error('kv unavailable');
      },
      put: async () => {
        throw new Error('kv unavailable');
      },
    } as unknown as KVNamespace;

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await consumeRateLimit(broken, 'ip:abc', LIMIT, WINDOW);
    warn.mockRestore();

    // A broken counter must not lock the intake out; it is logged instead.
    expect(result.allowed).toBe(true);
  });
});

describe('rate limit headers', () => {
  it('exposes the policy in headers a client can read', async () => {
    const kv = new FakeKV();
    const result = await consumeRateLimit(kv.asKVNamespace(), 'ip:abc', LIMIT, WINDOW);
    const headers = rateLimitHeaders(result);

    expect(headers['X-RateLimit-Limit']).toBe('5');
    expect(headers['X-RateLimit-Remaining']).toBe('4');
    expect(Number(headers['X-RateLimit-Reset'])).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(retryAfterSeconds(result)).toBeGreaterThan(0);
  });
});
