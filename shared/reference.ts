/**
 * Reference numbers use the format IT-<intake year>-<6 digit sequence>,
 * for example IT-2027-000123.
 *
 * The database assigns the sequence value (see the migration), but the format
 * itself is defined once here so the Worker, the SQL trigger and the tests
 * cannot drift apart.
 */

export const REFERENCE_PREFIX = 'IT';
export const REFERENCE_SEQUENCE_WIDTH = 6;

export const REFERENCE_PATTERN = /^IT-\d{4}-\d{6}$/;

export function formatReferenceNumber(intakeYear: number, sequence: number): string {
  if (!Number.isInteger(intakeYear) || intakeYear < 2000 || intakeYear > 9999) {
    throw new RangeError(`intakeYear must be a four digit year, received ${intakeYear}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`sequence must be a positive integer, received ${sequence}`);
  }
  if (sequence >= 10 ** REFERENCE_SEQUENCE_WIDTH) {
    throw new RangeError(`sequence exceeds ${REFERENCE_SEQUENCE_WIDTH} digits: ${sequence}`);
  }
  return `${REFERENCE_PREFIX}-${intakeYear}-${String(sequence).padStart(REFERENCE_SEQUENCE_WIDTH, '0')}`;
}

export function isReferenceNumber(value: unknown): value is string {
  return typeof value === 'string' && REFERENCE_PATTERN.test(value.trim().toUpperCase());
}

/** Reference numbers are stored uppercase; normalise whatever the applicant typed. */
export function normaliseReferenceNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}
