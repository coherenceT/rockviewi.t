import { describe, expect, it } from 'vitest';
import {
  calculateAge,
  MAX_FILE_BYTES,
  submissionPayloadSchema,
  validateDocumentFile,
} from '../../shared/validation';
import { programme } from '../../shared/config';

const ADULT_DOB = '2005-03-14';
const MINOR_DOB = '2010-03-14';

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Thandi',
    surname: 'Mkhize',
    dateOfBirth: ADULT_DOB,
    idNumber: '9001015800089',
    email: 'thandi@example.com',
    mobile: '0821234567',
    city: 'Pietermaritzburg',
    suburb: 'Northdale',
    highestQualification: 'National Senior Certificate',
    schoolName: 'Northdale Secondary School',
    yearCompleted: 2023,
    matricResultsSummary: 'Bachelor pass, mathematics 65%',
    programmeMode: 'full_time',
    pathway: 'a',
    startDate: programme.startDate,
    paymentOption: 'monthly',
    source: 'A friend at school',
    informationTrue: true,
    popiaConsent: true,
    marketingConsent: false,
    termsAccepted: true,
    ...overrides,
  };
}

describe('submissionPayloadSchema', () => {
  it('accepts a complete adult application and normalises the values', () => {
    const result = submissionPayloadSchema.safeParse(
      validPayload({ firstName: '  Thandi   Nomvula ', email: 'THANDI@Example.COM ', mobile: '082 123 4567' }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.firstName).toBe('Thandi Nomvula');
    expect(result.data.email).toBe('thandi@example.com');
    expect(result.data.mobile).toBe('0821234567');
    expect(result.data.idNumber).toBe('9001015800089');
    expect(result.data.yearCompleted).toBe(2023);
    expect(result.data.guardianName).toBeUndefined();
  });

  it('treats an empty ID or passport number as not supplied', () => {
    const result = submissionPayloadSchema.safeParse(validPayload({ idNumber: '   ' }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.idNumber).toBeUndefined();
  });

  it('rejects a malformed ID or passport number', () => {
    const result = submissionPayloadSchema.safeParse(validPayload({ idNumber: '12' }));
    expect(result.success).toBe(false);
  });

  it('requires a guardian for an applicant under 18', () => {
    const result = submissionPayloadSchema.safeParse(validPayload({ dateOfBirth: MINOR_DOB }));
    expect(result.success).toBe(false);
    if (result.success) return;
    const fields = result.error.issues.map((issue) => issue.path.join('.'));
    expect(fields).toContain('guardianName');
    expect(fields).toContain('guardianRelationship');
    expect(fields).toContain('guardianPhone');
    expect(fields).toContain('guardianEmail');
  });

  it('accepts a minor application that supplies complete guardian details', () => {
    const result = submissionPayloadSchema.safeParse(
      validPayload({
        dateOfBirth: MINOR_DOB,
        guardianName: 'Nomsa Mkhize',
        guardianRelationship: 'Mother',
        guardianPhone: '0837654321',
        guardianEmail: 'nomsa@example.com',
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects an invalid guardian email even when the other guardian fields are present', () => {
    const result = submissionPayloadSchema.safeParse(
      validPayload({
        dateOfBirth: MINOR_DOB,
        guardianName: 'Nomsa Mkhize',
        guardianRelationship: 'Mother',
        guardianPhone: '0837654321',
        guardianEmail: 'not-an-email',
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'guardianEmail')).toBe(true);
  });

  it('does not require guardian details for an adult', () => {
    const result = submissionPayloadSchema.safeParse(validPayload({ dateOfBirth: '2000-01-01' }));
    expect(result.success).toBe(true);
  });

  it('rejects malformed contact details and dates', () => {
    for (const override of [
      { email: 'thandi@@example' },
      { email: 'thandi@example' },
      { mobile: '12345' },
      { mobile: 'not a number' },
      { dateOfBirth: '14/03/2005' },
      { dateOfBirth: '2005-02-30' },
      { dateOfBirth: '2030-01-01' },
    ]) {
      expect(submissionPayloadSchema.safeParse(validPayload(override)).success).toBe(false);
    }
  });

  it('rejects required declarations that are not confirmed', () => {
    for (const override of [
      { informationTrue: false },
      { popiaConsent: false },
      { termsAccepted: false },
    ]) {
      expect(submissionPayloadSchema.safeParse(validPayload(override)).success).toBe(false);
    }
  });

  it('treats marketing consent as optional and defaults it to false', () => {
    const result = submissionPayloadSchema.safeParse(validPayload({ marketingConsent: undefined }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.marketingConsent).toBe(false);
  });

  it('rejects an unknown pathway, payment option or programme mode', () => {
    for (const override of [
      { pathway: 'd' },
      { paymentOption: 'crypto' },
      { programmeMode: 'part_time' },
    ]) {
      expect(submissionPayloadSchema.safeParse(validPayload(override)).success).toBe(false);
    }
  });

  it('pins the start date to the configured intake', () => {
    expect(submissionPayloadSchema.safeParse(validPayload({ startDate: '2027-03-01' })).success).toBe(false);
  });

  it('rejects a year completed outside a plausible range', () => {
    for (const year of [1949, 2100, 'not a year']) {
      expect(submissionPayloadSchema.safeParse(validPayload({ yearCompleted: year })).success).toBe(false);
    }
  });

  it('rejects names containing digits or symbols', () => {
    for (const firstName of ['Thandi99', '<script>']) {
      expect(submissionPayloadSchema.safeParse(validPayload({ firstName })).success).toBe(false);
    }
  });

  it('lists the offending field for every issue so the form can highlight it', () => {
    const result = submissionPayloadSchema.safeParse(validPayload({ email: 'bad', city: '' }));
    expect(result.success).toBe(false);
    if (result.success) return;
    const fields = result.error.issues.map((issue) => issue.path[0]);
    expect(fields).toContain('email');
    expect(fields).toContain('city');
  });
});

describe('calculateAge', () => {
  it('counts a birthday that has not happened yet this year', () => {
    expect(calculateAge('2005-03-14', new Date('2027-03-13T00:00:00Z'))).toBe(21);
    expect(calculateAge('2005-03-14', new Date('2027-03-14T00:00:00Z'))).toBe(22);
  });

  it('returns NaN for an unparseable date', () => {
    expect(Number.isNaN(calculateAge('nonsense'))).toBe(true);
  });
});

describe('validateDocumentFile', () => {
  it('accepts PDF, JPG and PNG within the size limit', () => {
    for (const [name, type] of [
      ['id.pdf', 'application/pdf'],
      ['id.jpg', 'image/jpeg'],
      ['id.jpeg', 'image/jpeg'],
      ['id.png', 'image/png'],
    ]) {
      expect(validateDocumentFile({ name: name!, type: type!, size: 1024 }).ok).toBe(true);
    }
  });

  it('accepts a file at exactly the maximum size', () => {
    expect(validateDocumentFile({ name: 'id.pdf', type: 'application/pdf', size: MAX_FILE_BYTES }).ok).toBe(true);
  });

  it('rejects files over the maximum size', () => {
    const result = validateDocumentFile({ name: 'id.pdf', type: 'application/pdf', size: MAX_FILE_BYTES + 1 });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/10 MB/);
  });

  it('rejects disallowed types and empty files', () => {
    expect(validateDocumentFile({ name: 'virus.exe', type: 'application/x-msdownload', size: 10 }).ok).toBe(false);
    expect(validateDocumentFile({ name: 'scan.pdf', type: 'text/html', size: 10 }).ok).toBe(false);
    expect(validateDocumentFile({ name: 'empty.pdf', type: 'application/pdf', size: 0 }).ok).toBe(false);
  });

  it('rejects a mismatched extension even when the declared type looks valid', () => {
    expect(validateDocumentFile({ name: 'id.pdf.exe', type: 'application/pdf', size: 10 }).ok).toBe(false);
  });
});
