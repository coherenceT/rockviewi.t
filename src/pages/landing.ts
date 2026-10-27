import '../styles/main.css';
import { initLayout } from '../components/layout';
import {
  examFeesCoveredLine,
  renderEarlyBirdPanel,
  renderFeeCalculator,
  renderFeesTable,
  renderPaymentOptions,
} from '../components/fees';
import { renderPathwayCards } from '../components/pathways';
import { courses, fees, formatRand } from '../../shared/courses';
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
      h('dd', { text: `${programme.maxLearnersPerLecturer} learners per lecturer, maximum` }),
    ),
  );
}

/** The pinned week card in the hero noticeboard, kept in step with config. */
function renderWeekBoard(): void {
  render(
    '#hero-week',
    h('p', { class: 'board-card__kicker', text: 'Your week' }),
    h(
      'dl',
      { class: 'week-list' },
      h(
        'div',
        {},
        h('dt', { text: 'Morning core' }),
        h('dd', { text: programme.schedule.morningCore }),
      ),
      h(
        'div',
        {},
        h('dt', { text: 'Afternoon pathway' }),
        h('dd', { text: programme.schedule.afternoonPathway }),
      ),
      h(
        'div',
        {},
        h('dt', { text: 'Fridays' }),
        h('dd', { text: programme.schedule.friday }),
      ),
    ),
  );
}

function renderWhyList(): void {
  const commitments = [
    {
      title: 'Every module ends in something you built',
      copy: 'Configure a computer, secure a small network, ship a web app or fix a broken system. The work is the assessment, not a multiple-choice paper.',
    },
    {
      title: 'A portfolio, assembled as you go',
      copy: 'You collect the projects across the ten months, so you leave with proof you can show an employer rather than a certificate alone.',
    },
    {
      title: 'Work-integrated learning before you finish',
      copy: 'A short placement or project in the second semester, with career support on Fridays and practice for the interview.',
    },
    {
      title: 'Small classes, real attention',
      copy: `A maximum of ${programme.maxLearnersPerLecturer} learners per lecturer, so the person teaching you knows the work you have done.`,
    },
  ];

  render(
    '#why-list',
    ...commitments.map((item) =>
      h(
        'li',
        {},
        h('h3', { text: item.title }),
        h('p', { text: item.copy }),
      ),
    ),
  );
}

function renderFeesLead(): void {
  render(
    '#fees-lead',
    `Tuition depends on the pathway you choose and is paid monthly for ${fees.months} months. ${examFeesCoveredLine()} The table below shows every pathway, exactly as the school publishes it.`,
  );
}

function renderFeesHighlight(): void {
  const monthly = courses.pathways.map((pathway) => pathway.tuition.monthly);
  const totals = courses.pathways.map((pathway) => pathway.tuition.total);

  render(
    '#fees-highlight',
    h('p', { class: 'price-plate__label', text: `Tuition per month, ${courses.intakeYear}` }),
    h('p', {
      class: 'price-plate__value',
      text: `${formatRand(Math.min(...monthly))} – ${formatRand(Math.max(...monthly))}`,
    }),
    h('p', {
      class: 'price-plate__note',
      text: `${formatRand(Math.min(...totals))} to ${formatRand(Math.max(...totals))} over ${fees.months} months, depending on your pathway. Exam fees covered.`,
    }),
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
  render(
    '#apply-steps',
    ...APPLY_STEPS.map((step) => h('li', {}, h('span', { class: 'apply-step__text', text: step }))),
  );
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
      question: 'Do I pay extra for exams?',
      answer: [
        h('p', { class: 'faq__covered', text: examFeesCoveredLine() }),
        h('p', {
          text: 'No. We cover the exam fees for the certifications in your pathway. [Add your retake policy here.]',
        }),
      ],
    },
    {
      question: 'How does payment work?',
      answer: [
        h('p', {
          text: `Tuition is paid monthly for ${fees.months} months, and the amount depends on your pathway: ${courses.pathways
            .map(
              (pathway) =>
                `${pathway.shortName} ${formatRand(pathway.tuition.monthly)} a month (${formatRand(pathway.tuition.total)})`,
            )
            .join('; ')}.`,
        }),
        h('p', { text: fees.earlyBird.displayLine }),
        h('p', {
          text: `${fees.registration.placeholder} ${fees.upfront.placeholder} Debit order, EFT and deposit options are confirmed at registration.`,
        }),
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
  renderWeekBoard();
  renderWhyList();
  renderPathwayCards('#pathway-cards');
  renderFeesLead();
  renderFeesHighlight();
  renderEarlyBirdPanel('#early-bird-panel');
  renderFeesTable('#fees-table');
  renderFeeCalculator('#fee-calculator');
  renderPaymentOptions('#payment-options');
  renderApplySteps();
  renderFaq();

  document.title = `${school.name} — practical IT training, ${programme.startLabel}`;
}

main();
