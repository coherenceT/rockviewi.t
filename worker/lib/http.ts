/** JSON responses, error shapes and the security header set. */

export const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com",
    'frame-src https://challenges.cloudflare.com',
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
};

export function withSecurityHeaders(headers: Headers): Headers {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return headers;
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    // Nothing this API returns should ever be cached by a shared cache.
    'Cache-Control': 'no-store, private',
  });
  for (const [name, value] of Object.entries(init.headers ?? {})) headers.set(name, value);
  withSecurityHeaders(headers);
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export interface FieldError {
  field: string;
  message: string;
}

export function errorResponse(
  code: string,
  message: string,
  init: { status?: number; fields?: FieldError[]; headers?: Record<string, string> } = {},
): Response {
  return jsonResponse(
    { ok: false, error: { code, message, ...(init.fields ? { fields: init.fields } : {}) } },
    { status: init.status ?? 400, headers: init.headers },
  );
}

export function methodNotAllowed(allowed: readonly string[]): Response {
  return errorResponse('method_not_allowed', `Use ${allowed.join(' or ')} for this endpoint.`, {
    status: 405,
    headers: { Allow: allowed.join(', ') },
  });
}

/** Same-origin check for state-changing requests. */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser client; the rate limit and Turnstile still apply
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

/** Client IP, used only as a rate-limit bucket key (hashed before it is stored). */
export function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown'
  );
}
