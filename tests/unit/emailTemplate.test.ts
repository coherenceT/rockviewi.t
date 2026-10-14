import { describe, expect, it } from 'vitest';
import { RECEIPT_DISCLAIMER, renderConfirmationEmail } from '../../shared/emailTemplates';
import { school } from '../../shared/config';

const BASE = {
  referenceNumber: 'IT-2027-000123',
  pathwayName: 'Cybersecurity and IT Support',
  firstName: 'Thandi',
  statusUrl: 'https://example.com/status',
  privacyUrl: 'https://example.com/privacy',
  marketingConsent: false,
  unsubscribeUrl: 'mailto:admissions@example.invalid?subject=Unsubscribe',
};

function render(overrides: Partial<typeof BASE> = {}) {
  return renderConfirmationEmail({ ...BASE, ...overrides });
}

describe('confirmation email', () => {
  it('uses the subject line from the brief, with the reference number', () => {
    const { subject } = render();
    expect(subject).toContain('We have received your application');
    expect(subject).toContain('IT-2027-000123');
  });

  it('carries every required element in both formats', () => {
    const { html, text } = render();

    for (const body of [html, text]) {
      expect(body).toContain('IT-2027-000123');
      expect(body).toContain('Cybersecurity and IT Support');
      expect(body).toContain(RECEIPT_DISCLAIMER);
      expect(body).toContain('https://example.com/status');
      expect(body).toContain('https://example.com/privacy');
      expect(body).toContain(school.contact.email);
    }
  });

  it('greets the applicant by first name only', () => {
    const { text } = render();
    expect(text).toContain('Hello Thandi');
  });

  it('states that receiving the email does not confirm a place', () => {
    const { html, text } = render();
    expect(text).toMatch(/does not confirm a place/i);
    expect(html).toMatch(/does not confirm a place/i);
  });

  it('never claims acceptance, a place, or a guaranteed job', () => {
    const { subject, html, text } = render();
    const combined = `${subject}\n${html}\n${text}`;

    const forbidden = [
      /you have been accepted/i,
      /your application (?:has been|was) accepted/i,
      /congratulations/i,
      /you have secured a place/i,
      /we are pleased to offer/i,
      /guaranteed job/i,
      /job guarantee/i,
      /you have a place at/i,
      /accredited/i,
      /NQF/,
    ];

    for (const pattern of forbidden) {
      expect(combined).not.toMatch(pattern);
    }
  });

  it('uses the accreditation placeholder rather than an accreditation claim', () => {
    const { html } = render();
    expect(html).toContain('Accreditation wording: TO BE CONFIRMED');
  });

  it('escapes values that could carry markup', () => {
    const { html } = render({ firstName: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('only includes the opt-out footer wording for marketing consent', () => {
    const optedIn = render({ marketingConsent: true });
    const optedOut = render({ marketingConsent: false });

    expect(optedIn.text).toContain('You opted in');
    expect(optedIn.text).toContain(BASE.unsubscribeUrl);
    expect(optedOut.text).toContain('You did not opt in');
    expect(optedOut.text).not.toContain('You opted in');
  });

  it('tells the applicant the email is transactional when marketing consent was declined', () => {
    const { text } = render({ marketingConsent: false });
    expect(text).toMatch(/transactional confirmation/i);
  });
});
