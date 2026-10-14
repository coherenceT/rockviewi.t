import '../styles/main.css';
import { initLayout } from '../components/layout';
import { api, school } from '../../shared/config';
import { STATUS_LABELS } from '../../shared/status';
import { h, qs, render } from '../lib/dom';
import type { ApplicationStatus } from '../../shared/types';

/**
 * Status lookup. The endpoint returns a status label and nothing else, so this
 * page has nothing sensitive to render. The response shape is typed here so a
 * future field added on the server would not silently appear in the UI.
 */

interface StatusResponse {
  ok: true;
  referenceNumber: string;
  status: ApplicationStatus;
  label: string;
  description: string;
}

function badgeClass(status: ApplicationStatus): string {
  switch (status) {
    case 'accepted_payment_pending':
      return 'badge badge--success';
    case 'not_successful':
      return 'badge badge--danger';
    case 'waitlisted':
      return 'badge badge--accent';
    case 'under_review':
      return 'badge badge--brand';
    default:
      return 'badge badge--neutral';
  }
}

function renderResult(reference: string, data: StatusResponse): void {
  const label = STATUS_LABELS[data.status] ?? data.label;

  render(
    '#status-result',
    h(
      'div',
      { class: 'card' },
      h('p', { class: 'card__meta', text: 'Reference number' }),
      h('p', { class: 'mono', text: reference }),
      h('p', { class: badgeClass(data.status), text: label }),
      h('p', { text: data.description }),
      data.status === 'accepted_payment_pending'
        ? h('p', {
            text: 'Your place is confirmed only once the payment steps in your admissions email have been completed.',
          })
        : null,
      h(
        'p',
        { class: 'muted' },
        `If something looks wrong, email ${school.contact.email} and quote your reference number.`,
      ),
    ),
  );
}

function renderError(message: string): void {
  render('#status-result', h('div', { class: 'notice notice--danger', attrs: { role: 'alert' } }, h('p', { text: message })));
}

async function main(): Promise<void> {
  initLayout();

  const form = qs<HTMLFormElement>('#status-form');
  const submit = qs<HTMLButtonElement>('#status-submit');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const reference = qs<HTMLInputElement>('#status-reference')?.value.trim() ?? '';
    const email = qs<HTMLInputElement>('#status-email')?.value.trim() ?? '';

    if (!reference || !email) {
      renderError('Enter both your reference number and the email address you applied with.');
      return;
    }

    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Checking…';
    }

    try {
      const response = await fetch(api.status, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ referenceNumber: reference, email }),
      });

      const data = (await response.json().catch(() => ({}))) as Partial<StatusResponse> & {
        error?: { message?: string };
      };

      if (!response.ok || !data.ok) {
        renderError(
          data.error?.message ??
            'We could not find an application with that reference number and email address. Check both and try again.',
        );
        return;
      }

      renderResult(data.referenceNumber ?? reference, data as StatusResponse);
    } catch {
      renderError('We could not reach the server. Check your connection and try again.');
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Check status';
      }
    }
  });
}

void main();
