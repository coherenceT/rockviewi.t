import type { Env } from '../env';
import { isProduction } from '../env';
import { logWarn } from './logger';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  ok: boolean;
  /** True when no secret is configured, so no check was performed. */
  skipped: boolean;
  codes: string[];
}

interface SiteVerifyResponse {
  success?: boolean;
  'error-codes'?: string[];
}

export async function verifyTurnstile(
  secret: string | undefined,
  token: string | undefined,
  remoteIp?: string,
): Promise<TurnstileResult> {
  if (!secret) return { ok: false, skipped: true, codes: ['missing-secret'] };
  if (!token) return { ok: false, skipped: false, codes: ['missing-input-response'] };

  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (remoteIp) body.append('remoteip', remoteIp);

  try {
    const response = await fetch(SITEVERIFY_URL, { method: 'POST', body });
    const data = (await response.json()) as SiteVerifyResponse;
    return {
      ok: data.success === true,
      skipped: false,
      codes: data['error-codes'] ?? [],
    };
  } catch {
    return { ok: false, skipped: false, codes: ['internal-error'] };
  }
}

/**
 * Whether a failed or missing Turnstile check should block a submission.
 *
 * Production fails closed: without a secret, submissions are refused rather
 * than silently unprotected. Development and preview keep working so the form
 * can be built and demonstrated before the school supplies keys, and the
 * omission is logged as a warning every time.
 */
export function turnstileEnforced(env: Env): boolean {
  if (env.TURNSTILE_SECRET) return true;
  if (isProduction(env)) return true;
  logWarn('turnstile_not_configured', { environment: env.ENVIRONMENT ?? 'development' });
  return false;
}
