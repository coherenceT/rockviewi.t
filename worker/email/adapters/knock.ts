import type { Env } from '../../env';
import { sha256Hex } from '../../lib/crypto';
import { AppError, ConfigurationError } from '../../lib/errors';
import { logInfo, logWarn } from '../../lib/logger';
import type { EmailAdapter, EmailMessage, EmailSendResult } from '../types';

/**
 * Knock adapter - the first real provider wired into `sendEmail()`.
 *
 * Knock is an orchestration layer, not a sender. This call queues a workflow
 * run, Knock renders the workflow's email step, and the provider configured
 * underneath Knock (Postmark in this project) performs the actual delivery.
 * Three consequences worth stating plainly:
 *
 *  1. The confirmation copy has to exist twice: `renderConfirmationEmail()`
 *     stays the source of truth in this repo (it is unit tested, and
 *     `outbound_emails` stores what was actually generated), and the Knock
 *     template must render `data.subject` / `data.body_html` / `data.body_text`
 *     rather than hard-code its own wording. Keeping the wording in the repo is
 *     deliberate: the brief pins that copy, and a dashboard edit cannot be
 *     caught by a test.
 *  2. The trigger is asynchronous. A 2xx means Knock accepted the run, not that
 *     mail has left the building, so the returned `workflow_run_id` is stored
 *     on `outbound_emails` as the trace handle for a later delivery problem.
 *  3. Knock's key is environment-scoped, so preview and production can hold
 *     different keys without code changes.
 *
 * Configuration is checked when a message is *sent*, never when the adapter is
 * constructed. A missing secret must degrade to a recorded email failure that
 * an admin can see, not take the applicant's submission down with it.
 */

const KNOCK_API_BASE = 'https://api.knock.app';
const SEND_TIMEOUT_MS = 10_000;

interface KnockCredentials {
  secretKey: string;
  workflowKey: string;
}

interface KnockTriggerResponse {
  workflow_run_id?: unknown;
}

function credentials(env: Env): KnockCredentials {
  const secretKey = env.KNOCK_SECRET_KEY?.trim() ?? '';
  const workflowKey = env.KNOCK_WORKFLOW_KEY?.trim() ?? '';

  if (!secretKey) {
    throw new ConfigurationError(
      'EMAIL_PROVIDER is "knock" but KNOCK_SECRET_KEY is not set. Set it with ' +
        '`wrangler pages secret put KNOCK_SECRET_KEY --project-name <project>`.',
    );
  }
  if (!workflowKey) {
    throw new ConfigurationError(
      'EMAIL_PROVIDER is "knock" but KNOCK_WORKFLOW_KEY is not set. Add it as a ' +
        'Pages environment variable (it is a workflow key, not a secret).',
    );
  }
  return { secretKey, workflowKey };
}

/**
 * A Knock recipient id derived from the address rather than the address
 * itself, so the id column in Knock's user records does not become a second
 * unencrypted copy of every applicant's email.
 */
async function recipientId(email: string): Promise<string> {
  return (await sha256Hex(email.trim().toLowerCase())).slice(0, 32);
}

/**
 * Stable across retries of the same message, and different for any other
 * message. Knock replays a repeated key for 24 hours instead of sending twice,
 * which turns our three backoff retries into at-most-one delivery.
 */
async function idempotencyKeyFor(message: EmailMessage): Promise<string> {
  const digest = await sha256Hex(`${message.to}\n${message.subject}\n${message.text}`);
  return `app-${digest.slice(0, 32)}`;
}

export function createKnockAdapter(env: Env): EmailAdapter {
  return {
    name: 'knock',

    async send(message: EmailMessage): Promise<EmailSendResult> {
      const { secretKey, workflowKey } = credentials(env);
      const template = message.template ?? 'unspecified';

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(`${KNOCK_API_BASE}/v1/workflows/${encodeURIComponent(workflowKey)}/trigger`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': await idempotencyKeyFor(message),
          },
          body: JSON.stringify({
            recipients: [{ id: await recipientId(message.to), email: message.to }],
            data: {
              subject: message.subject,
              body_html: message.html,
              body_text: message.text,
              template,
            },
          }),
          signal: controller.signal,
        });
      } catch {
        // Deliberately no message text: a thrown fetch error can echo the URL
        // or the request, and Worker logs must not carry personal data.
        logWarn('email_provider_unreachable', { provider: 'knock', template });
        throw new AppError('email_provider_unreachable', 'The email provider could not be reached.', 502);
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        // Only the status code travels further: a provider error body can
        // echo the payload we just posted, including the recipient address.
        logWarn('email_provider_rejected', { provider: 'knock', template, status: response.status });
        throw new AppError(
          'email_provider_error',
          `The email provider rejected the message (HTTP ${response.status}).`,
          502,
        );
      }

      let workflowRunId: string | null = null;
      try {
        const body = (await response.json()) as KnockTriggerResponse;
        workflowRunId = typeof body.workflow_run_id === 'string' ? body.workflow_run_id : null;
      } catch {
        workflowRunId = null;
      }

      logInfo('email_provider_accepted', { provider: 'knock', template });
      return { providerMessageId: workflowRunId };
    },
  };
}
