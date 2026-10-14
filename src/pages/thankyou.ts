import '../styles/main.css';
import { initLayout } from '../components/layout';
import { routes, school } from '../../shared/config';
import { isReferenceNumber, normaliseReferenceNumber } from '../../shared/reference';
import { h, render } from '../lib/dom';

/**
 * The confirmation page. The reference number is read from the path segment, so
 * the page is static and cacheable while still showing the applicant's own
 * reference. Nothing sensitive is ever placed here.
 */

function referenceFromPath(): string | null {
  const segments = window.location.pathname.split('/').filter(Boolean);
  const candidate = segments[segments.length - 1] ?? '';
  if (!candidate || candidate === 'thank-you') return null;
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return null;
  }
  return isReferenceNumber(decoded) ? normaliseReferenceNumber(decoded) : null;
}

const NEXT_STEPS = [
  'You should receive a confirmation email with your reference number. If it is not in your inbox within a few minutes, check your spam folder.',
  'The admissions team reviews your application and your documents.',
  'We may contact you if something is missing or unclear. Please watch the email address and mobile number you gave us.',
  'We let you know the outcome. If you are selected, your place is only confirmed once the payment steps have been completed.',
];

function renderWithReference(reference: string): void {
  render(
    '#thank-you',
    h('p', { class: 'badge badge--success', text: 'Application received' }),
    h('h1', { text: 'We have received your application' }),
    h('p', { class: 'section__lead' }, 'Keep your reference number safe. You need it, together with your email address, to check your status.'),
    h(
      'div',
      { class: 'notice notice--info' },
      h('p', { class: 'card__meta', text: 'Your reference number' }),
      h('p', { class: 'mono', text: reference }),
    ),
    h('h2', { class: 'mt-6', text: 'What happens next' }),
    h('ol', { class: 'tick-list' }, ...NEXT_STEPS.map((step) => h('li', { text: step }))),
    h(
      'div',
      { class: 'notice notice--accent mt-6' },
      h('p', {
        text: 'Receiving the confirmation email does not confirm a place. A place is only confirmed after the admissions decision and the payment steps.',
      }),
    ),
    h(
      'div',
      { class: 'btn-row mt-5' },
      h('a', { class: 'btn btn--primary', attrs: { href: routes.status }, text: 'Check your status' }),
      h('a', { class: 'btn btn--secondary', attrs: { href: routes.home }, text: 'Back to the home page' }),
    ),
    h('p', { class: 'muted mt-5' }, `Questions? Email ${school.contact.email} or phone ${school.contact.phone}.`),
  );
}

function renderNoReference(): void {
  render(
    '#thank-you',
    h('h1', { text: 'Check your reference number' }),
    h('p', {
      text: 'This page shows a reference number once an application has been submitted. We could not find a valid reference number in the address you opened.',
    }),
    h(
      'div',
      { class: 'btn-row' },
      h('a', { class: 'btn btn--primary', attrs: { href: routes.status }, text: 'Check your status' }),
      h('a', { class: 'btn btn--secondary', attrs: { href: routes.apply }, text: 'Start an application' }),
    ),
    h('p', { class: 'muted mt-5' }, `If you submitted an application and cannot find your reference number, email ${school.contact.email}.`),
  );
}

function main(): void {
  initLayout();
  const reference = referenceFromPath();
  if (reference) {
    renderWithReference(reference);
  } else {
    renderNoReference();
  }
}

main();
