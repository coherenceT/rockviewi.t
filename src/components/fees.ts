import { courses, fees, formatRand } from '../../shared/courses';
import { api } from '../../shared/config';
import { h, render } from '../lib/dom';
import { startCountdown } from './countdown';

interface EarlyBirdResponse {
  seats: number;
  remaining: number;
  paidCount: number | null;
  isOpen: boolean;
}

/**
 * Fees are rendered from courses.json, so a price change never touches layout.
 * The VAT note is only stated as fact once the school has confirmed the
 * treatment; until then the placeholder comes through unchanged.
 */

function row(label: string, value: string, note?: string) {
  return h(
    'tr',
    {},
    h('th', { attrs: { scope: 'row' }, text: label }),
    h('td', { class: 'num' }, h('strong', { text: value })),
    h('td', { text: note ?? '' }),
  );
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
        h('caption', { text: 'Fees for the 2027 intake' }),
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { attrs: { scope: 'col' }, text: 'Item' }),
            h('th', { attrs: { scope: 'col' }, text: 'Amount' }),
            h('th', { attrs: { scope: 'col' }, text: 'Notes' }),
          ),
        ),
        h(
          'tbody',
          {},
          row('Monthly', `${formatRand(fees.monthly.amount)} × ${fees.monthly.months} months`, `Total ${formatRand(fees.monthly.total)}`),
          row('Registration', formatRand(fees.registration.amount), 'Once-off'),
          row('Total, standard', formatRand(fees.standardTotal), `Monthly plan plus registration`),
          row(
            'Pay upfront',
            formatRand(fees.upfront.amount),
            `In full, paid before ${new Date(`${fees.upfront.payBefore}T00:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}`,
          ),
          row(
            'Early bird',
            formatRand(fees.earlyBird.amount),
            `First ${fees.earlyBird.seats} paid learners only, closes ${fees.earlyBird.closesLabel}`,
          ),
          row('Sponsor a seat', formatRand(fees.sponsorSeat.amount), 'Per learner. Enquiry only, no payment on this site.'),
        ),
      ),
    ),
    vatNote
      ? h('p', { class: 'mt-4' }, h('span', { class: 'placeholder-tag', text: vatNote }))
      : null,
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
    remainingLine.textContent = 'The early-bird offer has closed. The standard fee now applies.';
  });

  // Places remaining come from the counter the school maintains, read through
  // the Worker because that table has no public read policy.
  void (async () => {
    try {
      const response = await fetch(api.earlyBird, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('unavailable');
      const data = (await response.json()) as EarlyBirdResponse;

      if (data.paidCount === null) {
        remainingLine.textContent = `We could not load the live counter just now. The early-bird fee applies to the first ${data.seats} paid learners.`;
      } else if (!data.isOpen) {
        remainingLine.textContent = `All ${data.seats} early-bird places have been taken, or the offer has closed. The standard fee applies.`;
      } else {
        remainingLine.textContent = `${data.remaining} of ${data.seats} early-bird places left.`;
      }
    } catch {
      remainingLine.textContent = `We could not load the live counter just now. The early-bird fee applies to the first ${fees.earlyBird.seats} paid learners.`;
    } finally {
      window.addEventListener('pagehide', () => handle.stop(), { once: true });
    }
  })();
}

export function renderPaymentOptions(selector: string): void {
  render(
    selector,
    h('h3', { class: 'mt-6', text: 'Payment options' }),
    h(
      'div',
      { class: 'grid grid--2 mt-4' },
      ...courses.paymentOptions.map((option) =>
        h(
          'div',
          { class: 'card' },
          h('p', { class: 'card__meta', text: option.id.replace(/_/g, ' ') }),
          h('h3', { text: option.label }),
          h('p', { text: option.detail }),
        ),
      ),
      h(
        'div',
        { class: 'card' },
        h('p', { class: 'card__meta', text: 'sponsor enquiry' }),
        h('h3', { text: 'Sponsor a seat' }),
        h('p', { text: `${formatRand(courses.sponsor.amount)} per learner.` }),
        h('p', { text: courses.sponsor.note }),
        h(
          'p',
          { class: 'card__foot' },
          h('a', { class: 'btn btn--secondary', attrs: { href: courses.sponsor.enquiryHref }, text: 'Send an enquiry' }),
        ),
      ),
    ),
  );
}
