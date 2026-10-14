/** Bindings and variables available to Pages Functions. */
export interface Env {
  /** Supabase project URL, e.g. https://xxxxxxxx.supabase.co */
  SUPABASE_URL: string;
  /** Service role key. Server-side only: it bypasses RLS. */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** KV namespace backing the per-IP submission rate limit. */
  RATE_LIMIT?: KVNamespace;
  /** Turnstile secret. Absent until the school supplies one. */
  TURNSTILE_SECRET?: string;
  /** base64 32-byte key used to encrypt sensitive fields before storage. */
  FIELD_ENCRYPTION_KEY?: string;
  /** Absolute origin used to build the links inside confirmation emails. */
  PUBLIC_APP_ORIGIN?: string;
  /** development | preview | production */
  ENVIRONMENT?: string;
  /** dev | resend | ... - which email adapter to use. */
  EMAIL_PROVIDER?: string;
  EMAIL_FROM?: string;
  /** Knock secret key (`sk_...`). Server-side only; never in the bundle. */
  KNOCK_SECRET_KEY?: string;
  /** Key of the Knock workflow whose email step renders the confirmation. */
  KNOCK_WORKFLOW_KEY?: string;
  RATE_LIMIT_MAX?: string;
  RATE_LIMIT_WINDOW_SECONDS?: string;
  /** Local only: print the rendered email body. Refused in production. */
  EMAIL_DEV_LOG_BODY?: string;
  /** Static asset fetcher, provided by Cloudflare Pages to Pages Functions. */
  ASSETS?: Fetcher;
}

export function environment(env: Env): 'development' | 'preview' | 'production' {
  const value = (env.ENVIRONMENT ?? '').toLowerCase();
  if (value === 'production') return 'production';
  if (value === 'preview') return 'preview';
  return 'development';
}

export function isProduction(env: Env): boolean {
  return environment(env) === 'production';
}

export function appOrigin(env: Env, fallback: string): string {
  const configured = env.PUBLIC_APP_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const origin = fallback.replace(/\/+$/, '');
  return origin;
}

export function rateLimitConfig(env: Env): { limit: number; windowSeconds: number } {
  const limit = Number.parseInt(env.RATE_LIMIT_MAX ?? '5', 10);
  const windowSeconds = Number.parseInt(env.RATE_LIMIT_WINDOW_SECONDS ?? '3600', 10);
  return {
    limit: Number.isFinite(limit) && limit > 0 ? limit : 5,
    windowSeconds: Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : 3600,
  };
}
