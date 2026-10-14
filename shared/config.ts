/**
 * Brand and content configuration.
 *
 * Everything the school may want to change in one place lives here. Fields
 * marked TO BE CONFIRMED are placeholders: nothing in this codebase invents
 * a school name, legal wording, accreditation claim or contact detail.
 */

export const school = {
  /** PLACEHOLDER - replace once the school name is confirmed. */
  name: 'IT Career Foundation School',
  nameConfirmed: false,
  tagline: 'Practical IT career training with a portfolio and job-search support.',
  /** PLACEHOLDER contact details. */
  contact: {
    email: 'admissions@example.invalid',
    phone: '+27 00 000 0000',
    addressLines: ['Northdale', 'Pietermaritzburg', 'KwaZulu-Natal', 'South Africa'],
    confirmed: false,
  },
  location: 'Northdale, Pietermaritzburg, KwaZulu-Natal, South Africa',
  domain: 'example.invalid',
  domainConfirmed: false,
} as const;

export const programme = {
  startDate: '2027-02-01',
  monthCount: 10,
  startLabel: 'February 2027',
  endLabel: 'November 2027',
  deliveryMode: 'Full-time',
  schedule: {
    morningCore: '08:00-12:00, Monday to Friday',
    afternoonPathway: '13:00-15:00, Monday to Thursday',
    friday: 'Friday is reserved for labs, assessments, work-integrated learning and career support.',
  },
  maxLearnersPerLecturer: 22,
} as const;

/**
 * Legal / regulatory wording that must not be invented.
 * These strings are rendered verbatim as placeholders until approved wording
 * is supplied.
 */
export const legal = {
  accreditationPlaceholder: '[Accreditation wording: TO BE CONFIRMED]',
  accreditationApproved: false,
  nqfWordingPlaceholder: '[NQF / qualification status: TO BE CONFIRMED]',
  privacyNoticeStatus: 'PLACEHOLDER - replace with approved POPIA wording.',
  termsStatus: 'PLACEHOLDER - replace with approved terms of enrolment.',
  popiaConsentVersion: 'draft-1-unapproved',
  /** Retention default from the brief. Confirm before launch. */
  retentionYearsForRejectedApplications: 5,
  retentionConfirmed: false,
} as const;

export const routes = {
  home: '/',
  apply: '/apply',
  thankYou: (reference: string) => `/apply/thank-you/${encodeURIComponent(reference)}`,
  status: '/status',
  admin: '/admin',
  privacy: '/privacy',
  terms: '/terms',
  course: (pathwayId: string) => `/courses/${pathwayId}`,
} as const;

export const api = {
  applications: '/api/applications',
  status: '/api/status',
  earlyBird: '/api/early-bird',
} as const;
