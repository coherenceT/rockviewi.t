import { isProduction, type Env } from '../../env';
import { logInfo } from '../../lib/logger';
import { uuid } from '../../lib/crypto';
import type { EmailAdapter, EmailMessage, EmailSendResult } from '../types';

/**
 * Development adapter: nothing leaves the system.
 *
 * The rendered message is already persisted by the caller in `outbound_emails`,
 * so this adapter deliberately does not log the recipient address or the body
 * by default - Worker logs must not carry personal data. It logs only the
 * structural facts, and the body can be printed locally by setting
 * EMAIL_DEV_LOG_BODY=true outside production.
 */
export function createDevAdapter(env: Env): EmailAdapter {
  const logBody = env.EMAIL_DEV_LOG_BODY === 'true' && !isProduction(env);

  return {
    name: 'dev',
    async send(message: EmailMessage): Promise<EmailSendResult> {
      logInfo('email_dev_adapter', {
        provider: 'dev',
        template: message.template ?? 'unspecified',
        bytes: message.html.length + message.text.length,
      });

      if (logBody) {
        // Local development only. Explicitly refused in production above.
        console.log('[dev-email-html]', message.html);
      }

      return { providerMessageId: `dev-${uuid()}` };
    },
  };
}
