import { logWarn } from './logger';

/**
 * Fixed-window counters in an optional Workers KV binding.
 *
 * Two operations, on purpose:
 *
 *  - peek() reads the window without spending quota. It runs first so an
 *    abusive client is turned away before any work is done.
 *  - consume() spends quota. The submission endpoint only calls it once the
 *    payload has validated, so an applicant fixing a typo does not burn one of
 *    their five hourly attempts.
 *
 * KV is eventually consistent, so the counter can undercount under a burst.
 * If no binding exists (as on Freebuff Sites), these helpers are fail-open;
 * configure an edge rate limit at the hosting layer where available.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  /** True when no KV binding is configured or an operation failed. */
  unavailable: boolean;
}

interface CounterRecord {
  count: number;
  resetAt: number;
}

async function readCounter(kv: KVNamespace | undefined, key: string): Promise<CounterRecord | null> {
  if (!kv) return null;
  try {
    const record = await kv.get<CounterRecord>(key, 'json');
    if (!record || typeof record.count !== 'number' || typeof record.resetAt !== 'number') return null;
    return record;
  } catch {
    return null;
  }
}

async function writeCounter(
  kv: KVNamespace | undefined,
  key: string,
  record: CounterRecord,
  windowSeconds: number,
): Promise<void> {
  if (!kv) return;
  const ttl = Math.max(60, Math.min(windowSeconds, Math.ceil((record.resetAt - Date.now()) / 1000)));
  try {
    await kv.put(key, JSON.stringify(record), { expirationTtl: ttl });
  } catch {
    logWarn('rate_limit_write_failed', {});
  }
}

function unavailableResult(limit: number, windowSeconds: number, key: string): RateLimitResult {
  logWarn('rate_limit_unavailable', { reason: 'no_kv_binding', limit, environment: key ? 'configured' : 'missing' });
  return {
    allowed: true,
    limit,
    remaining: limit,
    resetAt: Date.now() + windowSeconds * 1000,
    unavailable: true,
  };
}

export async function peekRateLimit(
  kv: KVNamespace | undefined,
  bucketKey: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  if (!kv) return unavailableResult(limit, windowSeconds, bucketKey);

  const record = await readCounter(kv, `rl:${bucketKey}`);
  if (!record || record.resetAt <= now) {
    return { allowed: true, limit, remaining: limit, resetAt: now + windowSeconds * 1000, unavailable: false };
  }
  return {
    allowed: record.count < limit,
    limit,
    remaining: Math.max(0, limit - record.count),
    resetAt: record.resetAt,
    unavailable: false,
  };
}

export async function consumeRateLimit(
  kv: KVNamespace | undefined,
  bucketKey: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  if (!kv) return unavailableResult(limit, windowSeconds, bucketKey);

  const key = `rl:${bucketKey}`;
  const existing = await readCounter(kv, key);

  if (!existing || existing.resetAt <= now) {
    const fresh: CounterRecord = { count: 1, resetAt: now + windowSeconds * 1000 };
    await writeCounter(kv, key, fresh, windowSeconds);
    return { allowed: true, limit, remaining: limit - 1, resetAt: fresh.resetAt, unavailable: false };
  }

  if (existing.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt: existing.resetAt, unavailable: false };
  }

  const updated: CounterRecord = { count: existing.count + 1, resetAt: existing.resetAt };
  await writeCounter(kv, key, updated, windowSeconds);
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - updated.count),
    resetAt: updated.resetAt,
    unavailable: false,
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
  };
}

export function retryAfterSeconds(result: RateLimitResult): number {
  return Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
}
