import { legal, programme, school } from './config';

/**
 * Notice wording. The confirmation email must never suggest that an applicant
 * has been accepted or holds a place, so the wording is fixed here and covered
 * by a unit test.
 */
export const RECEIPT_DISCLAIMER =
  'Receiving this email does not confirm a place at the school. Your place is only confirmed after the admissions decision and after the payment steps have been completed.';

export interface ConfirmationEmailInput {
  referenceNumber: string;
  pathwayName: string;
  firstName: string;
  statusUrl: string;
  privacyUrl: string;
  marketingConsent: boolean;
  unsubscribeUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Blocks are shared by both formats so the two can never say different things. */
function blocks(input: ConfirmationEmailInput) {
  return [
    `Thank you for applying to ${school.name}.`,
    `Your reference number is ${input.referenceNumber}. Keep it safe - you will need it, together with the email address you applied with, to check your status.`,
    `Pathway applied for: ${input.pathwayName}.`,
    `Your application is under review by the admissions team.`,
    RECEIPT_DISCLAIMER,
    `You can check your status at any time: ${input.statusUrl}`,
    `Questions about your application? Email ${school.contact.email} or phone ${school.contact.phone}. Post: ${school.contact.addressLines.join(', ')}.`,
    `Privacy notice: ${input.privacyUrl}`,
  ];
}

export function renderConfirmationEmail(input: ConfirmationEmailInput): RenderedEmail {
  const subject = `We have received your application - ${input.referenceNumber}`;
  const body = blocks(input);

  const text = [
    `Hello ${input.firstName},`,
    '',
    ...body.flatMap((line) => [line, '']),
    `Programme: ${programme.deliveryMode}, ${programme.startLabel} to ${programme.endLabel}.`,
    '',
    input.marketingConsent
      ? `You opted in to occasional updates about ${school.name}. You can opt out at any time: ${input.unsubscribeUrl}`
      : 'You did not opt in to marketing messages. This email is a transactional confirmation of your application and is sent regardless of your marketing preference.',
    '',
    'This is an automated message. Replies to this address are monitored but not answered.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f6f8;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c2024;">
    <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
      <h1 style="font-size:20px;line-height:1.3;margin:0 0 16px;">Thank you for applying to ${escapeHtml(school.name)}</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hello ${escapeHtml(input.firstName)},</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
        Your reference number is <strong>${escapeHtml(input.referenceNumber)}</strong>. Keep it safe - you will need it,
        together with the email address you applied with, to check your status.
      </p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
        Pathway applied for: <strong>${escapeHtml(input.pathwayName)}</strong>.
      </p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Your application is under review by the admissions team.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px;padding:12px;background:#fff6e5;border-left:4px solid #d9930d;">
        ${escapeHtml(RECEIPT_DISCLAIMER)}
      </p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
        <a href="${escapeHtml(input.statusUrl)}" style="color:#12507b;">Check your application status</a>
      </p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#4a5058;">
        Questions about your application? Email
        <a href="mailto:${escapeHtml(school.contact.email)}" style="color:#12507b;">${escapeHtml(school.contact.email)}</a>
        or phone ${escapeHtml(school.contact.phone)}.<br />
        ${escapeHtml(school.contact.addressLines.join(', '))}
      </p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#4a5058;">
        <a href="${escapeHtml(input.privacyUrl)}" style="color:#12507b;">Privacy notice</a>
      </p>
      <hr style="border:none;border-top:1px solid #dfe3e8;margin:24px 0;" />
      <p style="font-size:12px;line-height:1.6;margin:0;color:#6b7280;">
        ${escapeHtml(legal.accreditationPlaceholder)}<br />
        ${escapeHtml(
          input.marketingConsent
            ? `You opted in to occasional updates about ${school.name}. You can opt out at any time: ${input.unsubscribeUrl}`
            : 'You did not opt in to marketing messages. This email is a transactional confirmation of your application.',
        )}
      </p>
    </div>
  </body>
</html>`;

  return { subject, html, text };
}
