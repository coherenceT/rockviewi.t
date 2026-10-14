import { describe, expect, it } from 'vitest';
import {
  formatReferenceNumber,
  isReferenceNumber,
  normaliseReferenceNumber,
  REFERENCE_PATTERN,
} from '../../shared/reference';

describe('formatReferenceNumber', () => {
  it('produces the documented IT-<year>-<6 digits> format', () => {
    expect(formatReferenceNumber(2027, 123)).toBe('IT-2027-000123');
  });

  it('pads short sequences to six digits', () => {
    expect(formatReferenceNumber(2027, 1)).toBe('IT-2027-000001');
    expect(formatReferenceNumber(2027, 999999)).toBe('IT-2027-999999');
  });

  it('matches the published pattern for every generated value', () => {
    for (const sequence of [1, 42, 123, 9999, 100000, 999999]) {
      expect(formatReferenceNumber(2027, sequence)).toMatch(REFERENCE_PATTERN);
    }
  });

  it('rejects sequences that cannot fit the format', () => {
    expect(() => formatReferenceNumber(2027, 0)).toThrow(RangeError);
    expect(() => formatReferenceNumber(2027, -1)).toThrow(RangeError);
    expect(() => formatReferenceNumber(2027, 1_000_000)).toThrow(RangeError);
    expect(() => formatReferenceNumber(2027, 1.5)).toThrow(RangeError);
  });

  it('rejects years that are not four digit years', () => {
    expect(() => formatReferenceNumber(27, 1)).toThrow(RangeError);
    expect(() => formatReferenceNumber(1999, 1)).toThrow(RangeError);
    expect(() => formatReferenceNumber(10000, 1)).toThrow(RangeError);
  });
});

describe('isReferenceNumber', () => {
  it('accepts generated references regardless of case or padding of spaces', () => {
    expect(isReferenceNumber('IT-2027-000123')).toBe(true);
    expect(isReferenceNumber('  it-2027-000123 ')).toBe(true);
  });

  it('rejects anything that is not the documented format', () => {
    for (const value of ['IT-2027-123', 'IT27-000123', 'XX-2027-000123', 'IT-2027-0000123', '', null, 42]) {
      expect(isReferenceNumber(value)).toBe(false);
    }
  });
});

describe('normaliseReferenceNumber', () => {
  it('uppercases and strips whitespace', () => {
    expect(normaliseReferenceNumber(' it-2027-000123 ')).toBe('IT-2027-000123');
    expect(normaliseReferenceNumber('IT - 2027 - 000123')).toBe('IT-2027-000123');
  });
});
