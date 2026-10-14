import type { Env } from '../../worker/env';
import { appOrigin, rateLimitConfig } from '../../worker/env';
import { createEmailModuleSafe } from '../../worker/email';
import { ValidationError } from '../../worker/lib/errors';
import {
  clientIp,
  errorResponse,
  isSameOriginRequest,
  jsonResponse,
  methodNotAllowed,
} from '../../worker/lib/http';
import { hashForLog, logError, logInfo } from '../../worker/lib/logger';
import { consumeRateLimit, peekRateLimit, rateLimitHeaders, retryAfterSeconds } from '../../worker/lib/rateLimit';
import { runHandler } from '../../worker/lib/respond';
import { turnstileEnforced, verifyTurnstile } from '../../worker/lib/turnstile';
import { assertConfigured, createSubmissionStore } from '../../worker/store/supabase';
import { submitApplication, type ParsedDocument } from '../../worker/services/submitApplication';
import { courses } from '../../shared/courses';
import { legal, school } from '../../shared/config';
import { DOCUMENT_TYPES, OPTIONAL_DOCUMENT_TYPES, type DocumentType } from '../../shared/types';
import {
  formatFieldErrors,
  submissionPayloadSchema,
  validateDocumentFile,
  type FileDescriptor,
} from '../../shared/validation';

/**
 * POST /api/applications
 *
 * The only way an application enters the system. Order of operations:
 *   1. same-origin check
 *   2. rate limit peek (turn abuse away before doing any work)
 *   3. parse and validate every field with the shared schema
 *   4. Turnstile verification
 *   5. rate limit consume (only real attempts spend quota)
 *   6. persist, upload, audit, queue and send the confirmation email
 */

export const CONFIRMATION_RETRY_ATTEMPTS = 3;
export const CONFIRMATION_RETRY_BACKOFF_MS = [250, 750];

/** Required documents. Proof of residence is optional (see OPTIONAL_DOCUMENT_TYPES). */
function requiredDocumentTypes(): DocumentType[] {
  return DOCUMENT_TYPES.filter((type) => !OPTIONAL_DOCUMENT_TYPES.includes(type));
}

interface FormParsingResult {
  payload: unknown;
  documents: ParsedDocument[];
  turnstileToken: string | undefined;
}

async function parseSubmissionForm(request: Request): Promise<FormParsingResult> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    throw new ValidationError([{ field: '_', message: 'Submit the application as a multipart form.' }]);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ValidationError([{ field: '_', message: 'That upload could not be read. Please try again.' }]);
  }

  const rawPayload = form.get('payload');
  if (typeof rawPayload !== 'string' || rawPayload.trim() === '') {
    throw new ValidationError([{ field: '_', message: 'The application details were missing from the request.' }]);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    throw new ValidationError([{ field: '_', message: 'The application details could not be read.' }]);
  }

  const documents: ParsedDocument[] = [];
  const fileErrors: Array<{ field: string; message: string }> = [];

  for (const documentType of DOCUMENT_TYPES) {
    const entry = form.get(documentType);

    if (entry === null || typeof entry === 'string') {
      if (requiredDocumentTypes().includes(documentType)) {
        const label = documentType.replace(/_/g, ' ');
        fileErrors.push({ field: documentType, message: `Please attach your ${label} document.` });
      }
      continue;
    }

    const file = entry as unknown as { name?: string; type?: string; size?: number; arrayBuffer: () => Promise<ArrayBuffer> };
    const descriptor: FileDescriptor = {
      name: typeof file.name === 'string' ? file.name : '',
      type: typeof file.type === 'string' ? file.type : '',
      size: typeof file.size === 'number' ? file.size : 0,
    };

    // Same rules the browser applied, re-applied here: the client is never trusted.
    const verdict = validateDocumentFile(descriptor);
    if (!verdict.ok) {
      fileErrors.push({ field: documentType, message: verdict.message ?? 'That file cannot be accepted.' });
      continue;
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength !== descriptor.size) {
      fileErrors.push({ field: documentType, message: 'That upload was interrupted. Please attach it again.' });
      continue;
    }

    documents.push({
      documentType,
      filename: descriptor.name,
      mimeType: descriptor.type,
      bytes: new Uint8Array(buffer),
    });
  }

  if (fileErrors.length > 0) throw new ValidationError(fileErrors);

  const token = form.get('turnstileToken');
  return { payload, documents, turnstileToken: typeof token === 'string' ? token : undefined };
}

export const onRequestPost: PagesFunction<Env> = async (context) =>
  runHandler(async () => {
    const { request, env } = context;

    if (!isSameOriginRequest(request)) {
      return errorResponse('cross_origin_blocked', 'This request did not come from the application site.', {
        status: 403,
      });
    }

    assertConfigured(env);

    const { limit, windowSeconds } = rateLimitConfig(env);
    const ipHash = await hashForLog(clientIp(request));
    const bucketKey = `applications:${ipHash}`;

    const peeked = await peekRateLimit(env.RATE_LIMIT, bucketKey, limit, windowSeconds);
    if (!peeked.allowed) {
      return errorResponse(
        'rate_limited',
        'Too many attempts from this connection. Please wait a little while and try again.',
        { status: 429, headers: { ...rateLimitHeaders(peeked), 'Retry-After': String(retryAfterSeconds(peeked)) } },
      );
    }

    const { payload, documents, turnstileToken } = await parseSubmissionForm(request);

    const validation = submissionPayloadSchema.safeParse(payload);
    if (!validation.success) {
      return errorResponse('validation_failed', 'Please correct the highlighted fields and submit again.', {
        status: 422,
        fields: formatFieldErrors(validation.error),
      });
    }

    if (turnstileEnforced(env)) {
      const result = await verifyTurnstile(env.TURNSTILE_SECRET, turnstileToken, clientIp(request));
      if (!result.ok) {
        if (result.skipped) {
          return errorResponse(
            'bot_protection_unavailable',
            'Bot protection is not configured on this deployment, so the application cannot be accepted. Please contact the school.',
            { status: 503 },
          );
        }
        return errorResponse('bot_check_failed', 'The bot check did not pass. Please reload the page and try again.', {
          status: 400,
        });
      }
    }

    const consumed = await consumeRateLimit(env.RATE_LIMIT, bucketKey, limit, windowSeconds);
    if (!consumed.allowed) {
      return errorResponse(
        'rate_limited',
        'Too many submissions from this connection. Please wait a little while and try again.',
        { status: 429, headers: { ...rateLimitHeaders(consumed), 'Retry-After': String(retryAfterSeconds(consumed)) } },
      );
    }

    const origin = appOrigin(env, new URL(request.url).origin);
    const store = createSubmissionStore(env);
    // A provider that is missing or misspelled must not stop the application
    // being saved: the send inside submitApplication fails, is retried, and is
    // recorded as failed for the admin to see.
    const email = createEmailModuleSafe(env);

    let result;
    try {
      result = await submitApplication(validation.data, documents, {
        store,
        email,
        config: {
          intakeYear: courses.intakeYear,
          consentVersion: legal.popiaConsentVersion,
          encryptionKey: env.FIELD_ENCRYPTION_KEY,
          retryAttempts: CONFIRMATION_RETRY_ATTEMPTS,
          retryBackoffMs: CONFIRMATION_RETRY_BACKOFF_MS,
        },
        links: { appOrigin: origin, contactEmail: school.contact.email },
      });
    } catch (error) {
      logError('application_submit_persistence_failed', { pathway: validation.data.pathway }, error);
      return errorResponse(
        'submission_failed',
        'We could not save your application, so nothing was recorded. Please try again in a few minutes.',
        { status: 502, headers: rateLimitHeaders(consumed) },
      );
    }

    logInfo('application_submitted', {
      pathway: validation.data.pathway,
      documents: documents.length,
      outcome: result.emailDelivered ? 'email_sent' : 'email_failed',
    });

    return jsonResponse(
      {
        ok: true,
        referenceNumber: result.referenceNumber,
        emailDelivered: result.emailDelivered,
        statusUrl: `${origin}/status`,
        thankYouUrl: `${origin}/apply/thank-you/${encodeURIComponent(result.referenceNumber)}`,
      },
      { status: 201, headers: rateLimitHeaders(consumed) },
    );
  });

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(['POST']);
