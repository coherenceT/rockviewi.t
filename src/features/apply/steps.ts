import { courses } from '../../../shared/courses';
import { legal, programme } from '../../../shared/config';

/**
 * The seven steps of the application.
 *
 * Only fields named in the brief are collected - nothing is added for the sake
 * of it. Field names match the shared Zod schema exactly, so validation is the
 * same in the browser and in the Worker.
 *
 * The consent statements are the brief's own wording, kept minimal on purpose:
 * the full legal text on /terms and /privacy is still a placeholder awaiting
 * approved wording, so these sentences must not be treated as final.
 */

export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'date'
  | 'number'
  | 'select'
  | 'textarea'
  | 'checkbox'
  | 'file';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  options?: readonly FieldOption[];
  autocomplete?: string;
  rows?: number;
  maxLength?: number;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  /** For type 'file': whether the document must be attached. */
  optionalFile?: boolean;
}

export interface StepDef {
  id: string;
  title: string;
  description?: string;
  fields: FieldDef[];
  /** True when the step is only shown if the applicant is under 18. */
  minorOnly?: boolean;
}

const PAYMENT_OPTIONS: readonly FieldOption[] = courses.paymentOptions.map((option) => ({
  value: option.id,
  label: `${option.label} — ${option.detail}`,
}));

const PATHWAY_OPTIONS: readonly FieldOption[] = courses.pathways.map((pathway) => ({
  value: pathway.id,
  label: `Pathway ${pathway.id.toUpperCase()}: ${pathway.name}`,
}));

export const PATHWAY_STEP_INDEX = 2;

export const STEPS: readonly StepDef[] = [
  {
    id: 'personal',
    title: 'Your details',
    description: 'How we identify you and how we reach you.',
    fields: [
      { name: 'firstName', label: 'First name', type: 'text', required: true, autocomplete: 'given-name', maxLength: 80 },
      { name: 'surname', label: 'Surname', type: 'text', required: true, autocomplete: 'family-name', maxLength: 80 },
      { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true, autocomplete: 'bday' },
      {
        name: 'idNumber',
        label: 'South African ID number or passport number',
        type: 'text',
        hint:
          'Optional. It helps us match your application to your certified ID or passport copy. It is encrypted before it is stored, and only admissions staff can read it.',
        maxLength: 20,
      },
      { name: 'email', label: 'Email address', type: 'email', required: true, autocomplete: 'email', inputMode: 'email' },
      { name: 'mobile', label: 'Mobile number', type: 'tel', required: true, autocomplete: 'tel', inputMode: 'tel' },
      { name: 'city', label: 'City or town', type: 'text', required: true, autocomplete: 'address-level2', maxLength: 80 },
      { name: 'suburb', label: 'Suburb', type: 'text', required: true, autocomplete: 'address-level3', maxLength: 80 },
    ],
  },
  {
    id: 'education',
    title: 'Your education',
    description: 'Your highest completed qualification.',
    fields: [
      {
        name: 'highestQualification',
        label: 'Highest qualification completed',
        type: 'text',
        required: true,
        hint: 'For example: National Senior Certificate, NCV, or a college certificate.',
        maxLength: 120,
      },
      { name: 'schoolName', label: 'School or institution', type: 'text', required: true, maxLength: 120 },
      {
        name: 'yearCompleted',
        label: 'Year completed',
        type: 'number',
        required: true,
        inputMode: 'numeric',
        hint: `The year you completed that qualification, up to ${courses.intakeYear}.`,
      },
      {
        name: 'matricResultsSummary',
        label: 'Matric results summary',
        type: 'textarea',
        rows: 3,
        optionalFile: false,
        hint: 'Optional. For example your overall pass type and the subjects most relevant to IT. Do not type your full certificate here - you will attach it later.',
        maxLength: 500,
      },
    ],
  },
  {
    id: 'programme',
    title: 'Your programme',
    description: `${programme.deliveryMode} programme starting ${programme.startLabel}.`,
    fields: [
      {
        name: 'pathway',
        label: 'Which pathway?',
        type: 'select',
        required: true,
        options: PATHWAY_OPTIONS,
      },
      {
        name: 'paymentOption',
        label: 'Preferred payment option',
        type: 'select',
        required: true,
        options: PAYMENT_OPTIONS,
        hint: 'This is your preference only. Nothing is payable through this website.',
      },
      {
        name: 'source',
        label: 'How did you hear about the school?',
        type: 'text',
        required: true,
        maxLength: 120,
      },
    ],
  },
  {
    id: 'guardian',
    title: 'Guardian details',
    description: 'Required because the applicant is under 18.',
    minorOnly: true,
    fields: [
      { name: 'guardianName', label: 'Guardian full name', type: 'text', maxLength: 120 },
      {
        name: 'guardianRelationship',
        label: 'Relationship to applicant',
        type: 'text',
        maxLength: 80,
        hint: 'For example: mother, father, legal guardian.',
      },
      { name: 'guardianPhone', label: 'Guardian phone number', type: 'tel', inputMode: 'tel' },
      { name: 'guardianEmail', label: 'Guardian email address', type: 'email', inputMode: 'email' },
    ],
  },
  {
    id: 'documents',
    title: 'Your documents',
    description: 'PDF, JPG or PNG. Maximum 10 MB each.',
    fields: [
      {
        name: 'certified_id',
        label: 'Certified copy of your ID or passport',
        type: 'file',
        required: true,
      },
      {
        name: 'highest_qualification',
        label: 'Certified copy of your highest qualification',
        type: 'file',
        required: true,
      },
      {
        name: 'proof_of_residence',
        label: 'Proof of residence',
        type: 'file',
        optionalFile: true,
        hint: 'Optional.',
      },
    ],
  },
  {
    id: 'consent',
    title: 'Consent and declaration',
    fields: [
      {
        name: 'informationTrue',
        label: 'I confirm that the information in this application is true and complete.',
        type: 'checkbox',
        required: true,
      },
      {
        name: 'popiaConsent',
        label:
          'I consent to my information being processed for admissions purposes under the Protection of Personal Information Act (POPIA).',
        type: 'checkbox',
        required: true,
      },
      {
        name: 'marketingConsent',
        label: 'I would also like to receive emails and SMS about the school. This is optional.',
        type: 'checkbox',
      },
      {
        name: 'termsAccepted',
        label: 'I agree to the terms of enrolment and I have read the privacy notice.',
        type: 'checkbox',
        required: true,
      },
    ],
  },
  {
    id: 'review',
    title: 'Review and submit',
    description: 'Check everything, then submit.',
    fields: [],
  },
];

export const CONSENT_VERSION = legal.popiaConsentVersion;

export const REVIEW_STEP_INDEX = STEPS.length - 1;
export const DOCUMENT_STEP_INDEX = STEPS.findIndex((step) => step.id === 'documents');
export const GUARDIAN_STEP_INDEX = STEPS.findIndex((step) => step.id === 'guardian');

export function stepFieldNames(step: StepDef): string[] {
  return step.fields.map((field) => field.name);
}
