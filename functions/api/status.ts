import type { Env } from '../../worker/env';
import { clientIp, errorResponse, isSameOriginRequest, jsonResponse, methodNotAllowed, readJson } from '../../worker/lib/http';
import { hashForLog } from '../../worker/lib/logger';
import { consumeRateLimit, rateLimitHeaders, retryAfterSeconds } from '../../worker/lib/rateLimit';
import { runHandler } from '../../worker/lib/respond';
import { assertConfigured, lookupStatus } from '../../worker/store/supabase';
import { statusLookupSchema } from '../../shared/validation';
import { STATUS_DESCRIPTIONS, STATUS_LABELS } from '../../shared/status';

/**
 * POST /api/status
 *
 * Returns one of five status labels and nothing else - never a document, a
 * field of personal data, or an internal note. A reference number alone is not
 * enough; the email address used on the application is required too.
 */
const LOOKUP_LIMIT = 30;
const LOOKUP_WINDOW_SECONDS = 3600;

const NOT_FOUND_MESSAGE =
  'We could not find an application with that reference number and email address. Check both and try again.';

export const onRequestPost: PagesFunction<Env> = async (context) =>
  runHandler(async () => {
    const { request, env } = context;

    if (!isSameOriginRequest(request)) {
      return errorResponse('cross_origin_blocked', 'This request did not come from the application site.', {
        status: 403,
      });
    }

    assertConfigured(env);

    const ipHash = await hashForLog(clientIp(request));
    const limited = await consumeRateLimit(
      env.RATE_LIMIT,
      `status:${ipHash}`,
      LOOKUP_LIMIT,
      LOOKUP_WINDOW_SECONDS,
    );
    if (!limited.allowed) {
      return errorResponse('rate_limited', 'Too many lookups from this connection. Please try again later.', {
        status: 429,
        headers: { ...rateLimitHeaders(limited), 'Retry-After': String(retryAfterSeconds(limited)) },
      });
    }

    const body = await readJson<Record<string, unknown>>(request);
    const parsed = statusLookupSchema.safeParse(body ?? {});
    if (!parsed.success) {
      // The same message as a genuine miss, so this route cannot be used to
      // test whether a reference number exists.
      return errorResponse('not_found', NOT_FOUND_MESSAGE, {
        status: 404,
        headers: rateLimitHeaders(limited),
      });
    }

    const found = await lookupStatus(env, parsed.data.referenceNumber, parsed.data.email);
    if (!found) {
      return errorResponse('not_found', NOT_FOUND_MESSAGE, {
        status: 404,
        headers: rateLimitHeaders(limited),
      });
    }

    return jsonResponse(
      {
        ok: true,
        referenceNumber: parsed.data.referenceNumber,
        status: found.status,
        label: STATUS_LABELS[found.status],
        description: STATUS_DESCRIPTIONS[found.status],
      },
      { headers: rateLimitHeaders(limited) },
    );
  });

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(['POST']);
