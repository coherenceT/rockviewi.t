import { z } from 'zod';
import { programme } from './config';
import { PAYMENT_OPTIONS, PATHWAY_IDS } from './types';

/**
 * The single validation schema for an application submission.
 *
 * The browser imports this to validate each step before it lets the applicant
 * continue; the Worker imports the exact same schema and re-validates. The
 * server is the authority: the client copy is only for friendly feedback.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'] as const;

const INTAKE_YEAR = Number(programme.startDate.slice(0, 4));

function clean(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value;
}

function text(label: string, min: number, max: number) {
  return z.preprocess(
    clean,
    z
      .string({ required_error: `${label} is required` })
      .min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
      .max(max, `${label} must be ${max} characters or fewer`),
  );
}

function personName(label: string) {
  return z.preprocess(
    clean,
    z
      .string({ required_error: `${label} is required` })
      .min(2, `${label} is required`)
      .max(80, `${label} must be 80 characters or fewer`)
      .regex(
        /^[\p{L}\p{M}][\p{L}\p{M}'.\- ]*$/u,
        `${label} may only contain letters, spaces, apostrophes, hyphens and full stops`,
      ),
  );
}

export const emailSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.string({ required_error: 'Email address is required' }).email('Enter a valid email address').max(254),
);

export const mobileSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.replace(/[\s()\-.]/g, '') : value),
  z
    .string({ required_error: 'Mobile number is required' })
    .regex(/^\+?\d{9,15}$/, 'Enter a valid mobile number, for example 0821234567 or +27821234567'),
);

export const dateOfBirthSchema = z.preprocess(
  clean,
  z
    .string({ required_error: 'Date of birth is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must use the format YYYY-MM-DD')
    .refine(isRealDate, 'Date of birth is not a real date')
    .refine((value) => new Date(`${value}T00:00:00Z`).getTime() <= Date.now(), 'Date of birth cannot be in the future')
    .refine(
      (value) => calculateAge(value) <= 100,
      'Please check the date of birth - the applicant would be over 100 years old',
    ),
);

export const optionalIdNumberSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value ?? undefined;
    const trimmed = value.trim().toUpperCase();
    return trimmed === '' ? undefined : trimmed;
  },
  z
    .string()
    .regex(
      /^(\d{13}|[A-Z0-9][A-Z0-9\- ]{5,19})$/,
      'Enter a 13 digit South African ID number, or a passport number of 6 to 20 characters',
    )
    .optional(),
);

export const referenceNumberSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : value),
  z.string({ required_error: 'Reference number is required' }).regex(/^IT-\d{4}-\d{6}$/, 'Enter the reference number exactly as it appears in your email, for example IT-2027-000123'),
);

const yesRequired = (message: string) =>
  z.preprocess((value) => value === true || value === 'true', z.boolean().refine((v) => v === true, { message }));

const optionalConsent = z.preprocess(
  (value) => value === true || value === 'true',
  z.boolean().default(false),
);

const optionalText = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value ?? undefined;
      const trimmed = value.replace(/\s+/g, ' ').trim();
      return trimmed === '' ? undefined : trimmed;
    },
    z.string().max(max, `Use ${max} characters or fewer`).optional(),
  );

export function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

export function calculateAge(dateOfBirth: string, on: Date = new Date()): number {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return Number.NaN;
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = on.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && on.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

/* -------------------------------------------------------------------------- */
/* Submission payload                                                          */
/* -------------------------------------------------------------------------- */

export const submissionPayloadSchema = z
  .object({
    // Step 1 - personal details
    firstName: personName('First name'),
    surname: personName('Surname'),
    dateOfBirth: dateOfBirthSchema,
    idNumber: optionalIdNumberSchema,
    email: emailSchema,
    mobile: mobileSchema,
    city: text('City', 2, 80),
    suburb: text('Suburb', 2, 80),

    // Step 2 - education
    highestQualification: text('Highest qualification', 2, 120),
    schoolName: text('School name', 2, 120),
    yearCompleted: z.coerce
      .number({ required_error: 'Year completed is required' })
      .int('Year completed must be a whole year')
      .min(1950, 'Year completed must be 1950 or later')
      .max(INTAKE_YEAR, `Year completed cannot be later than ${INTAKE_YEAR}`),
    matricResultsSummary: optionalText(500),

    // Step 3 - programme choice
    programmeMode: z.literal('full_time', {
      errorMap: () => ({ message: 'This intake is full-time only' }),
    }),
    pathway: z.enum(PATHWAY_IDS, {
      errorMap: () => ({ message: 'Choose pathway A, B or C' }),
    }),
    startDate: z
      .string({ required_error: 'Start date is required' })
      .refine((value) => value === programme.startDate, `The start date for this intake is ${programme.startLabel}`),
    paymentOption: z.enum(PAYMENT_OPTIONS, {
      errorMap: () => ({ message: 'Choose a payment option' }),
    }),
    source: text('How you heard about the school', 1, 120),

    // Step 4 - guardian details (required only when the applicant is under 18)
    guardianName: optionalText(120),
    guardianRelationship: optionalText(80),
    guardianPhone: optionalText(30),
    guardianEmail: optionalText(254),

    // Step 6 - consent and declaration
    informationTrue: yesRequired('You must confirm that the information you supplied is true'),
    popiaConsent: yesRequired(
      'You must consent to your information being processed for admissions under POPIA',
    ),
    marketingConsent: optionalConsent,
    termsAccepted: yesRequired('You must agree to the terms of enrolment and the privacy notice'),
  })
  .superRefine((value, ctx) => {
    const age = calculateAge(value.dateOfBirth);
    const isMinor = Number.isFinite(age) && age < 18;
    if (!isMinor) return;

    const required: Array<[keyof typeof value, string]> = [
      ['guardianName', 'Guardian name is required because the applicant is under 18'],
      ['guardianRelationship', 'Guardian relationship is required because the applicant is under 18'],
      ['guardianPhone', 'Guardian phone number is required because the applicant is under 18'],
      ['guardianEmail', 'Guardian email is required because the applicant is under 18'],
    ];
    for (const [field, message] of required) {
      const fieldValue = value[field];
      if (typeof fieldValue !== 'string' || fieldValue.trim() === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
      }
    }
    if (typeof value.guardianEmail === 'string' && value.guardianEmail.trim() !== '') {
      const parsed = emailSchema.safeParse(value.guardianEmail);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['guardianEmail'], message: 'Enter a valid guardian email address' });
      }
    }
    if (typeof value.guardianPhone === 'string' && value.guardianPhone.trim() !== '') {
      const parsed = mobileSchema.safeParse(value.guardianPhone);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['guardianPhone'], message: 'Enter a valid guardian phone number' });
      }
    }
  });

export type SubmissionPayload = z.output<typeof submissionPayloadSchema>;
export type SubmissionPayloadInput = z.input<typeof submissionPayloadSchema>;

export const statusLookupSchema = z.object({
  referenceNumber: referenceNumberSchema,
  email: emailSchema,
});
export type StatusLookup = z.output<typeof statusLookupSchema>;

/* -------------------------------------------------------------------------- */
/* Documents                                                                   */
/* -------------------------------------------------------------------------- */

export interface FileDescriptor {
  name: string;
  type: string;
  size: number;
}

export interface FileValidationResult {
  ok: boolean;
  message?: string;
}

export function fileExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index).toLowerCase();
}

/** Used by the browser before upload and by the Worker before it stores anything. */
export function validateDocumentFile(file: FileDescriptor): FileValidationResult {
  const extension = fileExtension(file.name);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
    return { ok: false, message: 'Upload a PDF, JPG or PNG file' };
  }
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: 'Upload a PDF, JPG or PNG file' };
  }
  if (file.size <= 0) {
    return { ok: false, message: 'That file appears to be empty' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, message: 'Each file must be 10 MB or smaller' };
  }
  return { ok: true };
}

export function formatFieldErrors(error: z.ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '_',
    message: issue.message,
  }));
}
