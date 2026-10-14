import type { Env } from '../env';
import { AppError } from '../lib/errors';
import { logError } from '../lib/logger';
import { createDevAdapter } from './adapters/dev';
import { createKnockAdapter } from './adapters/knock';
import type { EmailAdapter, EmailMessage, EmailSendResult } from './types';

export type { EmailAdapter, EmailMessage, EmailSendResult } from './types';

/**
 * The single email seam for the whole application.
 *
 * Everything in this project sends mail by calling `sendEmail({ to, subject,
 * html, text })`. Swapping providers means adding one adapter file and setting
 * EMAIL_PROVIDER plus the provider's API key as a Cloudflare secret - no call
 * site changes, and no provider SDK anywhere near the browser.
 */

export interface EmailModule {
  readonly provider: string;
  sendEmail(message: EmailMessage): Promise<EmailSendResult>;
}

function resolveAdapter(env: Env): EmailAdapter {
  const provider = (env.EMAIL_PROVIDER ?? 'dev').toLowerCase();

  switch (provider) {
    case 'dev':
    case '':
      return createDevAdapter(env);

    case 'knock':
      return createKnockAdapter(env);

    // A provider that is selected but not yet implemented. Add one file under
    // adapters/ and one case here; the API key always comes from the Worker
    // environment (a Cloudflare secret), never from code or the bundle.
    default:
      throw new AppError(
        'email_provider_not_configured',
        `EMAIL_PROVIDER is "${provider}", but no adapter is implemented for it yet. Add worker/email/adapters/${provider}.ts and set the provider API key as a Cloudflare secret.`,
        503,
      );
  }
}

export function createEmailModule(env: Env): EmailModule {
  const adapter = resolveAdapter(env);
  return {
    provider: adapter.name,
    sendEmail: (message: EmailMessage) => adapter.send(message),
  };
}

/**
 * Never lets email configuration decide whether an application is saved.
 *
 * The submission contract is that a misconfigured or broken provider produces
 * a recorded failure an admin can see, while the application itself persists.
 * `createEmailModule` throws for an unknown provider name, so anything that
 * builds it outside the retry path has to be able to survive the throw.
 */
export function createEmailModuleSafe(env: Env): EmailModule {
  try {
    return createEmailModule(env);
  } catch (error) {
    logError('email_module_unavailable', { provider: env.EMAIL_PROVIDER || 'dev' }, error);
    const reason =
      error instanceof AppError ? error.message : 'The email provider is not configured on this deployment.';
    return {
      provider: 'unavailable',
      sendEmail: async () => {
        throw new AppError('email_provider_not_configured', reason, 503);
      },
    };
  }
}
