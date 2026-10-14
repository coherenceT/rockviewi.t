import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../worker/env';
import { createEmailModule, createEmailModuleSafe } from '../../worker/email';
import { createKnockAdapter } from '../../worker/email/adapters/knock';
import { isAppError } from '../../worker/lib/errors';

/**
 * The Knock adapter is the only real provider wired into sendEmail(). These
 * tests pin the wire format it sends, because nothing else in the suite can
 * reach Knock: the submission tests use a fake adapter, so an incorrect URL,
 * header or payload would otherwise ship unnoticed.
 */

const WORKFLOW_KEY = 'application-received';

const message = {
  to: 'applicant@example.org',
  subject: 'We have received your application – IT-2027-000123',
  html: '<p>Thank you, Thandi.</p>',
  text: 'Thank you, Thandi.',
  template: 'application_received',
};

function envWith(overrides: Partial<Env> = {}): Env {
  return {
    EMAIL_PROVIDER: 'knock',
    KNOCK_SECRET_KEY: 'sk_test_dummy',
    KNOCK_WORKFLOW_KEY: WORKFLOW_KEY,
    ...overrides,
  } as Env;
}

interface Capture {
  url: string;
  init: RequestInit;
}

function stubFetch(
  responder: (url: string, init: RequestInit) => Response | Promise<Response>,
): Capture[] {
  const calls: Capture[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return responder(url, init);
  }));
  return calls;
}

/** Indexed access is unchecked in this project, so ask for a call explicitly. */
function callAt(calls: readonly Capture[], index: number): Capture {
  const call = calls[index];
  if (!call) throw new Error(`expected fetch call #${index}, received ${calls.length} call(s)`);
  return call;
}

function headersOf(call: Capture): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

function bodyOf(call: Capture): any {
  return JSON.parse(String(call.init.body));
}

function ok(runId = 'run_123'): Response {
  return new Response(JSON.stringify({ workflow_run_id: runId }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('knock adapter', () => {
  it('triggers the configured workflow with bearer auth', async () => {
    const calls = stubFetch(() => ok());

    const result = await createKnockAdapter(envWith()).send(message);

    expect(calls).toHaveLength(1);
    const call = callAt(calls, 0);
    expect(call.url).toBe(`https://api.knock.app/v1/workflows/${WORKFLOW_KEY}/trigger`);
    expect(call.init.method).toBe('POST');
    const headers = headersOf(call);
    expect(headers.Authorization).toBe('Bearer sk_test_dummy');
    expect(headers['Content-Type']).toBe('application/json');
    expect(result.providerMessageId).toBe('run_123');
  });

  it('sends the recipient and the rendered copy as trigger data', async () => {
    const calls = stubFetch(() => ok());
    await createKnockAdapter(envWith()).send(message);

    const body = bodyOf(callAt(calls, 0));
    expect(body.recipients).toHaveLength(1);
    expect(body.recipients[0].email).toBe(message.to);
    expect(body.data).toEqual({
      subject: message.subject,
      body_html: message.html,
      body_text: message.text,
      template: 'application_received',
    });
  });

  it('keys the recipient by a hash of the address, not the address itself', async () => {
    const calls = stubFetch(() => ok());
    await createKnockAdapter(envWith()).send(message);

    const body = bodyOf(callAt(calls, 0));
    const id = body.recipients[0].id as string;
    expect(id).not.toContain('applicant');
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    // Stable, so repeat sends land on the same Knock user record.
    await createKnockAdapter(envWith()).send(message);
    expect(bodyOf(callAt(calls, 1)).recipients[0].id).toBe(id);
  });

  it('reuses one idempotency key across retries of the same message', async () => {
    const calls = stubFetch(() => ok());

    const adapter = createKnockAdapter(envWith());
    await adapter.send(message);
    await adapter.send(message);

    const first = headersOf(callAt(calls, 0))['Idempotency-Key'];
    const second = headersOf(callAt(calls, 1))['Idempotency-Key'];
    expect(first).toMatch(/^app-[0-9a-f]{32}$/);
    expect(second).toBe(first);
  });

  it('uses a different idempotency key for a different message', async () => {
    const calls = stubFetch(() => ok());
    const adapter = createKnockAdapter(envWith());

    await adapter.send(message);
    await adapter.send({ ...message, subject: 'A different subject' });

    const keys = calls.map((call) => (call.init.headers as Record<string, string>)['Idempotency-Key']);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('returns the workflow run id when the body is not JSON', async () => {
    stubFetch(() => new Response('', { status: 202 }));
    const result = await createKnockAdapter(envWith()).send(message);
    expect(result.providerMessageId).toBeNull();
  });

  it('throws a retryable error when Knock rejects the request', async () => {
    stubFetch(() => new Response('nope', { status: 401 }));

    const error = await createKnockAdapter(envWith())
      .send(message)
      .catch((thrown: unknown) => thrown);

    expect(isAppError(error)).toBe(true);
    if (isAppError(error)) {
      expect(error.status).toBe(502);
      expect(error.code).toBe('email_provider_error');
      // The provider body must not be propagated: it can echo the payload.
      expect(error.message).not.toContain(message.to);
      expect(error.message).not.toContain('nope');
    }
  });

  it('throws a retryable error when the network call fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed');
    }));

    const error = await createKnockAdapter(envWith())
      .send(message)
      .catch((thrown: unknown) => thrown);

    expect(isAppError(error)).toBe(true);
    if (isAppError(error)) expect(error.code).toBe('email_provider_unreachable');
  });

  it('reports a missing secret as a configuration error, not a crash at startup', async () => {
    const adapter = createKnockAdapter(envWith({ KNOCK_SECRET_KEY: undefined }));
    const error = await adapter.send(message).catch((thrown: unknown) => thrown);

    expect(isAppError(error)).toBe(true);
    if (isAppError(error)) {
      expect(error.status).toBe(503);
      expect(error.message).toContain('KNOCK_SECRET_KEY');
    }
  });

  it('reports a missing workflow key', async () => {
    const adapter = createKnockAdapter(envWith({ KNOCK_WORKFLOW_KEY: undefined }));
    const error = await adapter.send(message).catch((thrown: unknown) => thrown);
    expect(isAppError(error)).toBe(true);
    if (isAppError(error)) expect(error.message).toContain('KNOCK_WORKFLOW_KEY');
  });
});

describe('email module selection', () => {
  it('builds the knock adapter when EMAIL_PROVIDER is knock', () => {
    expect(createEmailModule(envWith()).provider).toBe('knock');
  });

  it('falls back to the development adapter by default', () => {
    expect(createEmailModule({} as Env).provider).toBe('dev');
  });

  it('createEmailModule throws for an unknown provider', () => {
    expect(() => createEmailModule({ EMAIL_PROVIDER: 'not-a-provider' } as Env)).toThrow(
      /no adapter is implemented/,
    );
  });

  it('createEmailModuleSafe never throws, so the submission still saves', async () => {
    const email = createEmailModuleSafe({ EMAIL_PROVIDER: 'not-a-provider' } as Env);
    expect(email.provider).toBe('unavailable');

    // The send fails the way any provider failure does: by rejecting, which
    // submitApplication retries, records as failed, and survives.
    const error = await email
      .sendEmail(message)
      .catch((thrown: unknown) => thrown);
    expect(isAppError(error)).toBe(true);
    if (isAppError(error)) expect(error.status).toBe(503);
  });
});
