import '../styles/main.css';
import { initLayout } from '../components/layout';
import { courses, fees, formatRand } from '../../shared/courses';
import { legal, programme, routes, school } from '../../shared/config';
import { bodyData, h, render } from '../lib/dom';

/**
 * Placeholder legal pages.
 *
 * These pages deliberately do not draft legal wording. They state the facts the
 * code can prove - what the form collects, who can see it, how long it is kept
 * by default - and mark everything that needs approved wording as a placeholder
 * so it cannot be mistaken for a finished notice.
 */

function placeholder(children: Array<Node | string>) {
  return h(
    'div',
    { class: 'notice notice--accent' },
    h('p', {}, h('span', { class: 'placeholder-tag', text: 'PLACEHOLDER — TO BE REPLACED WITH APPROVED WORDING' })),
    ...children,
  );
}

function renderPrivacy(): void {
  render(
    '#legal-content',
    h('h1', { text: 'Privacy notice' }),
    placeholder([
      h('p', {
        text: 'This page is a placeholder. Replace it with the approved POPIA privacy notice before the site is launched. Do not treat the wording below as legal advice or as a final notice.',
      }),
      h('p', {}, h('span', { class: 'placeholder-tag', text: legal.accreditationPlaceholder })),
    ]),

    h('h2', { class: 'mt-6', text: 'Who is responsible' }),
    h('p', {
      text: `The school, ${school.name}, ${school.location}. Contact: ${school.contact.email}. ${school.contact.confirmed ? '' : '[Contact details: TO BE CONFIRMED]'}`,
    }),

    h('h2', { class: 'mt-6', text: 'What the application form collects' }),
    h(
      'ul',
      { class: 'tick-list' },
      h('li', { text: 'Your name, date of birth, email address, mobile number, city and suburb.' }),
      h('li', { text: 'Your ID or passport number, if you choose to supply it.' }),
      h('li', { text: 'Your education history: highest qualification, school or institution, and year completed.' }),
      h('li', { text: 'Your pathway and payment preference, and how you heard about the school.' }),
      h('li', { text: 'Guardian details, only if you are under 18.' }),
      h('li', { text: 'A certified copy of your ID or passport, your highest qualification, and optionally proof of residence.' }),
      h('li', { text: 'Your consent choices, with the date and time you gave them.' }),
    ),

    h('h2', { class: 'mt-6', text: 'What is not collected' }),
    h('p', {
      text: 'Nothing else. The form asks only for what admissions needs, and payment details are never requested through this website.',
    }),

    h('h2', { class: 'mt-6', text: 'How your information is protected' }),
    h(
      'ul',
      { class: 'tick-list' },
      h('li', { text: 'The site is served over HTTPS only.' }),
      h('li', {
        text: 'Documents are stored in a private bucket. They are never public, and staff open them through links that expire within minutes.',
      }),
      h('li', {
        text: 'Your ID or passport number is encrypted before it is stored, using a key that is held outside the database.',
      }),
      h('li', {
        text: 'Only signed-in staff accounts can see applications. Public visitors cannot read the database directly at all.',
      }),
      h('li', { text: 'Worker logs do not contain your personal information.' }),
    ),

    h('h2', { class: 'mt-6', text: 'How long it is kept' }),
    h('p', {
      text: `By default an unsuccessful application is kept for ${legal.retentionYearsForRejectedApplications} years before it is deleted. ${legal.retentionConfirmed ? '' : '[Retention period: TO BE CONFIRMED]'}`,
    }),
    h('p', {
      text: 'You can ask us to delete your application and documents at any time. When we do, we record that the deletion happened so we can prove it, without keeping the deleted information.',
    }),

    h('h2', { class: 'mt-6', text: 'Your choices' }),
    h('p', {
      text: 'Consent to processing for admissions is required for us to consider your application. Consent to marketing emails and SMS is optional, and you can withdraw it at any time without affecting your application.',
    }),

    h('h2', { class: 'mt-6', text: 'Contact and complaints' }),
    h('p', {
      text: `Send access, correction or deletion requests to ${school.contact.email}. ${legal.privacyNoticeStatus}`,
    }),

    h(
      'div',
      { class: 'btn-row mt-6' },
      h('a', { class: 'btn btn--secondary', attrs: { href: routes.terms }, text: 'Terms of enrolment' }),
      h('a', { class: 'btn btn--secondary', attrs: { href: routes.status }, text: 'Check your application status' }),
    ),
  );
}

function renderTerms(): void {
  render(
    '#legal-content',
    h('h1', { text: 'Terms of enrolment' }),
    placeholder([
      h('p', {
        text: 'This page is a placeholder. The terms of enrolment have not been drafted or approved yet, so nothing on this page is a term you are agreeing to.',
      }),
      h('p', { text: legal.termsStatus }),
    ]),

    h('h2', { class: 'mt-6', text: 'What is already published' }),
    h(
      'ul',
      { class: 'tick-list' },
      h('li', { text: `Programme: ${programme.deliveryMode}, ${programme.startLabel} to ${programme.endLabel}, ${programme.monthCount} months.` }),
      h('li', { text: `Morning core: ${programme.schedule.morningCore}. Afternoon pathway: ${programme.schedule.afternoonPathway}.` }),
      h('li', { text: programme.schedule.friday }),
      h('li', { text: `Class size: a maximum of ${programme.maxLearnersPerLecturer} learners per lecturer.` }),
      h('li', {
        text: `Tuition is set by the pathway and is paid monthly for ${fees.months} months: ${courses.pathways
          .map(
            (pathway) =>
              `${pathway.shortName} ${formatRand(pathway.tuition.monthly)} a month (${formatRand(pathway.tuition.total)})`,
          )
          .join('; ')}.`,
      }),
      h('li', { text: fees.examFeesCoveredLine }),
      h('li', { text: `${fees.registration.placeholder} ${fees.upfront.placeholder}` }),
      h('li', { text: fees.earlyBird.displayLine }),
      h('li', { text: `Sponsor a seat: ${courses.sponsor.note}` }),
    ),

    h('h2', { class: 'mt-6', text: 'What an application does not do' }),
    h(
      'ul',
      { class: 'tick-list' },
      h('li', { text: 'Submitting an application does not reserve a place and does not mean you have been accepted.' }),
      h('li', {
        text: 'A place is only confirmed after the admissions decision and after the payment steps have been completed.',
      }),
      h('li', { text: 'No payment is taken on this website. Do not send money to anyone based on this site alone.' }),
    ),

    h('h2', { class: 'mt-6', text: 'Still to be added by the school' }),
    h('p', {
      text: 'Cancellation and refund rules, attendance requirements, assessment and progression rules, and the fee escalation policy all still need approved wording.',
    }),
    h('p', {}, h('span', { class: 'placeholder-tag', text: legal.accreditationPlaceholder })),

    h(
      'div',
      { class: 'btn-row mt-6' },
      h('a', { class: 'btn btn--secondary', attrs: { href: routes.privacy }, text: 'Privacy notice' }),
      h('a', { class: 'btn btn--secondary', attrs: { href: routes.apply }, text: 'Apply' }),
    ),
  );
}

function main(): void {
  initLayout();
  const kind = bodyData('legal');
  if (kind === 'terms') {
    renderTerms();
    document.title = `Terms of enrolment — ${school.name}`;
  } else {
    renderPrivacy();
    document.title = `Privacy notice — ${school.name}`;
  }
}

main();
