import { APPLICATION_STATUSES, type ApplicationStatus } from './types';

/**
 * Applicant-facing status labels.
 *
 * These are the only strings the public /status page may show. None of them
 * implies acceptance unless the recorded status genuinely is
 * `accepted_payment_pending`, and even that says payment steps are still pending.
 */
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  received: 'Received',
  under_review: 'Under review',
  accepted_payment_pending: 'Accepted, payment steps pending',
  not_successful: 'Not successful',
  waitlisted: 'Waitlisted',
};

/** Short explanation shown under each label on the status page. */
export const STATUS_DESCRIPTIONS: Record<ApplicationStatus, string> = {
  received:
    'We have your application and the automated confirmation email has been sent. No decision has been made yet.',
  under_review: 'The admissions team is reviewing your application and documents.',
  accepted_payment_pending:
    'You have been selected, but your place is not confirmed yet. Your place is only confirmed once the payment steps in your admissions email are completed.',
  not_successful: 'This application was not successful for this intake.',
  waitlisted:
    'You are on the waiting list. We will contact you if a place becomes available.',
};

export const STAFF_STATUS_ORDER: readonly ApplicationStatus[] = APPLICATION_STATUSES;

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export function statusLabel(status: string): string {
  return isApplicationStatus(status) ? STATUS_LABELS[status] : 'Unknown';
}
