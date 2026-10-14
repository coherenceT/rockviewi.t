import '../styles/main.css';
import { initLayout } from '../components/layout';
import { renderEarlyBirdPanel, renderFeesTable, renderPaymentOptions } from '../components/fees';
import { renderPathwayCards } from '../components/pathways';
import { courses, fees } from '../../shared/courses';
import { legal, programme, school } from '../../shared/config';
import { h, render } from '../lib/dom';

/**
 * The landing page copy is in index.html so it exists without JavaScript. The
 * parts that must stay in step with courses.json - the pathway cards, the fee
 * table, the countdown and the live places counter - are rendered here.
 */

function renderHeroFacts(): void {
  render(
    '#hero-facts',
    h(
      'div',
      {},
      h('dt', { text: 'Starts' }),
      h('dd', { text: programme.startLabel }),
    ),
    h(
      'div',
      {},
      h('dt', { text: 'Runs for' }),
      h('dd', { text: `${programme.monthCount} months, to ${programme.endLabel}` }),
    ),
    h(
      'div',
      {},
      h('dt', { text: 'Class size' }),
      h('dd', { text: `Maximum ${programme.maxLearnersPerLecturer} learners per lecturer` }),
    ),
  );
}

function renderWhyList(): void {
  render(
    '#why-list',
    h('li', {
      text: 'Practical training: every module ends in something you built, configured, secured or fixed.',
    }),
    h('li', { text: 'A portfolio you can show an employer, assembled across the ten months.' }),
    h('li', {
      text: 'Work-integrated learning: a short placement or project in the second semester, with career support on Fridays.',
    }),
    h('li', {
      text: `Small classes: a maximum of ${programme.maxLearnersPerLecturer} learners per lecturer.`,
    }),
  );
}

function renderFeesLead(): void {
  render(
    '#fees-lead',
    `The programme costs ${courses.currency} ${fees.standardTotal.toLocaleString('en-ZA')} in total on the standard plan. The table below shows every option, exactly as the school publishes it.`,
  );
}

const APPLY_STEPS = [
  'Your details and how to reach you',
  'Your education history',
  'Your pathway and payment choice',
  'Guardian details, if you are under 18',
  'Your documents: certified ID or passport, and your highest qualification',
  'Consent and declaration',
  'Review and submit',
];

function renderApplySteps(): void {
  render('#apply-steps', ...APPLY_STEPS.map((step) => h('li', { text: step })));
}

interface FaqEntry {
  question: string;
  answer: Node[];
}

function renderFaq(): void {
  const vatNote = fees.vat.statusConfirmed ? null : h('span', { class: 'placeholder-tag', text: fees.vat.placeholder });

  const entries: FaqEntry[] = [
    {
      question: 'What laptop do I need?',
      answer: [
        h('p', {}, h('span', { class: 'placeholder-tag', text: '[Laptop requirement: TO BE CONFIRMED]' })),
        h('p', {
          text: 'We have not published a device specification yet. Contact admissions before you buy anything, so you do not spend money on a machine that will not carry you through the programme.',
        }),
      ],
    },
    {
      question: 'What happens after I apply?',
      answer: [
        h('p', {
          text: 'You immediately receive a reference number on screen and a confirmation email that says we have received your application. Your application then goes to the admissions team for review.',
        }),
        h('p', {
          text: 'You can check your status at any time with your reference number and the email address you applied with. A place is only confirmed after the admissions decision and the payment steps.',
        }),
      ],
    },
    {
      question: 'Is the school accredited?',
      answer: [
        h('p', {}, h('span', { class: 'placeholder-tag', text: legal.accreditationPlaceholder })),
        h('p', {
          text: 'We do not make an accreditation or qualification claim until the approved wording is in place. Please ask admissions directly if you need this confirmed before you apply.',
        }),
      ],
    },
    {
      question: 'How does payment work?',
      answer: [
        h('p', {
          text: `Standard plan: ${fees.monthly.amount.toLocaleString('en-ZA')} rand a month for ${fees.monthly.months} months, plus a once-off registration fee of ${fees.registration.amount.toLocaleString('en-ZA')} rand. Paying upfront is ${fees.upfront.amount.toLocaleString('en-ZA')} rand in full before the end of January 2027.`,
        }),
        h('p', { text: fees.earlyBird.displayLine }),
        vatNote ? h('p', {}, vatNote) : h('p'),
        h('p', {
          text: 'Sponsoring a seat is an enquiry, not a payment: no payment is taken on this site.',
        }),
      ],
    },
    {
      question: 'Is there a job guarantee?',
      answer: [
        h('p', {
          text: 'No. We do not offer a job guarantee, and we will not claim one. What the programme provides is practical training, a portfolio, work-integrated learning and job-search support.',
        }),
        h('p', { text: courses.salaryNote }),
      ],
    },
  ];

  render(
    '#faq-list',
    ...entries.map((entry) =>
      h(
        'details',
        {},
        h('summary', { text: entry.question }),
        h('div', {}, ...entry.answer),
      ),
    ),
  );
}

function main(): void {
  initLayout();
  renderHeroFacts();
  renderWhyList();
  renderPathwayCards('#pathway-cards');
  renderFeesLead();
  renderEarlyBirdPanel('#early-bird-panel');
  renderFeesTable('#fees-table');
  renderPaymentOptions('#payment-options');
  renderApplySteps();
  renderFaq();

  document.title = `${school.name} — practical IT training, ${programme.startLabel}`;
}

main();
