import { courses, fees, formatRand, type Pathway } from '../../shared/courses';
import { api } from '../../shared/config';
import { h, render } from '../lib/dom';
import { startCountdown } from './countdown';
import { pathArt } from './pathArt';

interface EarlyBirdResponse {
  seats: number;
  remaining: number;
  paidCount: number | null;
  isOpen: boolean;
}

/**
 * Fees come from courses.json, so a price change never touches layout.
 *
 * Tuition is priced per pathway, and certification exam fees are covered by the
 * school, so there is no exam-fee line anywhere. The other fee items are only
 * named once the school has confirmed them; until then the placeholder in
 * courses.json comes through unchanged.
 */

/** The one sentence every page uses about exam fees. */
export function examFeesCoveredLine(): string {
  return fees.examFeesCoveredLine;
}

export function renderFeesTable(selector: string): void {
  const vatNote = fees.vat.statusConfirmed ? '' : fees.vat.placeholder;

  render(
    selector,
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        {},
        h('caption', { text: `Tuition for the ${courses.intakeYear} intake, per pathway` }),
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { attrs: { scope: 'col' }, text: 'Pathway' }),
            h('th', { attrs: { scope: 'col' }, text: 'Tuition per month' }),
            h('th', { attrs: { scope: 'col' }, text: `Total tuition (${fees.months} months)` }),
          ),
        ),
        h(
          'tbody',
          {},
          ...courses.pathways.map((pathway) =>
            h(
              'tr',
              {},
              h(
                'th',
                { attrs: { scope: 'row' } },
                h(
                  'span',
                  { class: 'table-path' },
                  pathArt(pathway.art, `${pathway.name} illustration`, 'sm'),
                  h('span', { class: 'table-path__text', text: pathway.name }),
                ),
              ),
              h(
                'td',
                { class: 'num', attrs: { 'data-label': 'Per month' } },
                h('strong', { text: formatRand(pathway.tuition.monthly) }),
              ),
              h(
                'td',
                { class: 'num total', attrs: { 'data-label': '10 months' } },
                h('strong', { text: formatRand(pathway.tuition.total) }),
              ),
            ),
          ),
        ),
      ),
    ),
    h(
      'p',
      { class: 'fees-covered' },
      h('span', { class: 'fees-covered__tick', attrs: { 'aria-hidden': 'true' }, text: '✓' }),
      h('span', { text: fees.examFeesCoveredLine }),
    ),
    vatNote ? h('p', { class: 'mt-4' }, h('span', { class: 'placeholder-tag', text: vatNote })) : null,
  );
}

/** Pick a pathway, see its tuition — monthly, ten months, and the covered line. */
export function renderFeeCalculator(selector: string): void {
  const output = h('div', { class: 'calc__out', attrs: { 'aria-live': 'polite' } });
  const choices = h('fieldset', {
    class: 'calc__choices',
    attrs: { 'aria-label': 'Choose a pathway' },
  });

  const write = (pathway: Pathway): void => {
    render(
      output,
      h(
        'div',
        { class: 'calc__row' },
        h('span', { text: 'Monthly tuition' }),
        h('b', { text: formatRand(pathway.tuition.monthly) }),
      ),
      h(
        'div',
        { class: 'calc__row' },
        h('span', { text: `Tuition × ${pathway.tuition.months} months` }),
        h('b', { text: formatRand(pathway.tuition.total) }),
      ),
      h(
        'p',
        { class: 'calc__included' },
        h('span', { class: 'calc__tick', attrs: { 'aria-hidden': 'true' }, text: '✓' }),
        h('span', { text: 'Exam fees included' }),
      ),
    );
  };

  courses.pathways.forEach((pathway, index) => {
    const input = h('input', {
      attrs: { type: 'radio', name: 'fee-pathway', value: pathway.id, checked: index === 0 },
    });

    input.addEventListener('change', () => {
      if (input.checked) write(pathway);
    });

    choices.appendChild(
      h(
        'label',
        { class: 'calc__choice' },
        input,
        h('span', { class: 'calc__radio', attrs: { 'aria-hidden': 'true' } }),
        pathArt(pathway.art, `${pathway.name} illustration`, 'sm'),
        h('span', { class: 'calc__choice-label', text: pathway.shortName }),
        h('span', { class: 'calc__choice-price', text: `${formatRand(pathway.tuition.monthly)} /m` }),
      ),
    );
  });

  const first = courses.pathways[0];
  if (first) write(first);

  render(
    selector,
    h(
      'div',
      { class: 'calc' },
      h(
        'div',
        { class: 'calc__head' },
        h('h3', { text: 'Fee calculator' }),
        h('span', { text: `Pick a pathway · ${fees.months} months` }),
      ),
      h('div', { class: 'calc__body' }, choices, output),
      h('p', {
        class: 'calc__hint',
        text: `Tuition only. ${fees.examFeesCoveredLine} Nothing is charged on this website.`,
      }),
    ),
  );
}

export function renderEarlyBirdPanel(selector: string): void {
  const panel = h('div', { class: 'notice notice--accent' });
  const countdownHost = h('div', {});
  const remainingLine = h('p', { class: 'mt-4', text: 'Checking how many places are left…' });

  panel.appendChild(h('h3', { text: 'Early bird' }));
  panel.appendChild(h('p', { text: fees.earlyBird.displayLine }));
  panel.appendChild(countdownHost);
  panel.appendChild(remainingLine);
  panel.appendChild(
    h(
      'div',
      { class: 'btn-row mt-4' },
      h('a', { class: 'btn btn--primary', attrs: { href: '/apply' }, text: 'Apply now' }),
      h('a', {
        class: 'btn btn--secondary',
        attrs: { href: courses.sponsor.enquiryHref },
        text: 'Sponsor a seat (enquiry)',
      }),
    ),
  );
  panel.appendChild(
    h('p', {
      class: 'mt-4 muted',
      text: 'Sponsoring a seat is an enquiry only, not a payment. Fees are shown in South African rand.',
    }),
  );

  render(selector, panel);

  const handle = startCountdown(fees.earlyBird.closesAt, countdownHost, () => {
    remainingLine.textContent = 'The early-bird offer has closed. The standard tuition for your pathway applies.';
  });

  // Places remaining come from the counter the school maintains, read through
  // the Worker because that table has no public read policy.
  void (async () => {
    try {
      const response = await fetch(api.earlyBird, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('unavailable');
      const data = (await response.json()) as EarlyBirdResponse;

      if (data.paidCount === null) {
        remainingLine.textContent = `We could not load the live counter just now. The early-bird offer applies to the first ${data.seats} paid learners.`;
      } else if (!data.isOpen) {
        remainingLine.textContent = `All ${data.seats} early-bird places have been taken, or the offer has closed.`;
      } else {
        remainingLine.textContent = `${data.remaining} of ${data.seats} early-bird places left.`;
      }
    } catch {
      remainingLine.textContent = `We could not load the live counter just now. The early-bird offer applies to the first ${fees.earlyBird.seats} paid learners.`;
    } finally {
      window.addEventListener('pagehide', () => handle.stop(), { once: true });
    }
  })();
}

export function renderPaymentOptions(selector: string): void {
  render(
    selector,
    h('h3', { class: 'payment-heading', text: 'Ways to pay' }),
    h(
      'div',
      { class: 'payment-list' },
      ...courses.paymentOptions.map((option) =>
        h(
          'div',
          { class: `payment-row${option.id === 'sponsored' ? ' payment-row--sponsor' : ''}` },
          h('h4', { text: option.label }),
          h('p', { class: 'payment-row__detail', text: option.detail }),
          option.id === 'sponsored'
            ? h('a', { class: 'text-link', attrs: { href: courses.sponsor.enquiryHref }, text: 'Send an enquiry' })
            : null,
        ),
      ),
    ),
    h('p', { class: 'payment-row__detail mt-4', text: courses.paymentMethodsNote }),
  );
}
