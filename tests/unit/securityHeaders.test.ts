import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { errorResponse, isSameOriginRequest, jsonResponse, methodNotAllowed, SECURITY_HEADERS, withSecurityHeaders } from '../../worker/lib/http';

describe('security headers', () => {
  it('includes every header the brief requires', () => {
    expect(SECURITY_HEADERS['Strict-Transport-Security']).toContain('max-age=');
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(SECURITY_HEADERS['Content-Security-Policy']).toBeTruthy();
  });

  it('locks down the surfaces that would let injected content act', () => {
    const csp = SECURITY_HEADERS['Content-Security-Policy']!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'self'");
    // Scripts must not fall back to inline or eval.
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('allows Supabase and Turnstile, and nothing else, to be contacted', () => {
    const csp = SECURITY_HEADERS['Content-Security-Policy']!;
    const connect = csp.split('; ').find((directive) => directive.startsWith('connect-src'))!;
    expect(connect).toContain('https://*.supabase.co');
    expect(connect).toContain('https://challenges.cloudflare.com');
    expect(connect).not.toContain('*;');
    expect(connect).not.toMatch(/(^|\s)\*/);
  });

  it('keeps the static _headers file in step with the code', () => {
    const file = readFileSync('public/_headers', 'utf8');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(file).toContain(`${name}: ${value}`);
    }
  });

  it('does not overwrite a header that was already set', () => {
    const headers = new Headers({ 'X-Frame-Options': 'SAMEORIGIN' });
    withSecurityHeaders(headers);
    expect(headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
  });
});

describe('response helpers', () => {
  it('never allows an API response to be cached', async () => {
    const response = jsonResponse({ ok: true });
    expect(response.headers.get('Cache-Control')).toBe('no-store, private');
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('returns field errors so the form can highlight them', async () => {
    const response = errorResponse('validation_failed', 'Fix these', {
      status: 422,
      fields: [{ field: 'email', message: 'Enter a valid email address' }],
    });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string; fields: unknown[] } };
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.fields).toHaveLength(1);
  });

  it('advertises the allowed methods on a 405', () => {
    const response = methodNotAllowed(['POST']);
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });
});

describe('same-origin check', () => {
  it('accepts a request from the same host', () => {
    const request = new Request('https://school.example/api/applications', {
      method: 'POST',
      headers: { Origin: 'https://school.example' },
    });
    expect(isSameOriginRequest(request)).toBe(true);
  });

  it('rejects a request from another site', () => {
    const request = new Request('https://school.example/api/applications', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    expect(isSameOriginRequest(request)).toBe(false);
  });

  it('rejects a malformed Origin header', () => {
    const request = new Request('https://school.example/api/applications', {
      method: 'POST',
      headers: { Origin: 'not a url' },
    });
    expect(isSameOriginRequest(request)).toBe(false);
  });
});
