import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashForLog, logError, logInfo, logWarn } from '../../worker/lib/logger';

const PERSONAL_VALUES = ['thandi@example.com', '0821234567', 'Thandi Mkhize', '9001015800089'];

function capture(run: () => void): string {
  const lines: string[] = [];
  const info = vi.spyOn(console, 'log').mockImplementation((...args) => void lines.push(args.join(' ')));
  const warn = vi.spyOn(console, 'warn').mockImplementation((...args) => void lines.push(args.join(' ')));
  const error = vi.spyOn(console, 'error').mockImplementation((...args) => void lines.push(args.join(' ')));
  run();
  info.mockRestore();
  warn.mockRestore();
  error.mockRestore();
  return lines.join('\n');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logger redaction', () => {
  it('never writes a value whose key looks like personal data', () => {
    const output = capture(() =>
      logInfo('application_submitted', {
        email: PERSONAL_VALUES[0]!,
        mobile: PERSONAL_VALUES[1]!,
        firstName: PERSONAL_VALUES[2]!,
        idNumber: PERSONAL_VALUES[3]!,
        note: 'called the applicant',
      }),
    );

    for (const value of PERSONAL_VALUES) {
      expect(output).not.toContain(value);
    }
    expect(output).toContain('[redacted]');
  });

  it('keeps the fields the operations team actually needs', () => {
    const output = capture(() => logInfo('application_submitted', { pathway: 'b', documents: 2, outcome: 'email_sent' }));
    expect(output).toContain('"pathway":"b"');
    expect(output).toContain('"documents":2');
    expect(output).toContain('"outcome":"email_sent"');
  });

  it('drops the value of an unknown field rather than guessing', () => {
    const output = capture(() => logInfo('mystery', { somethingNew: 'value that might be personal' }));
    expect(output).not.toContain('value that might be personal');
    expect(output).toContain('[omitted]');
  });

  it('records only the error class, never the message', () => {
    const output = capture(() =>
      logError('application_submission_failed', {}, new Error('failed for thandi@example.com')),
    );
    expect(output).not.toContain('thandi@example.com');
    expect(output).toContain('"errorCode":"Error"');
  });

  it('emits valid single-line JSON', () => {
    const output = capture(() => logWarn('rate_limit_unavailable', { reason: 'no_kv_binding', limit: 5 }));
    expect(output.split('\n')).toHaveLength(1);
    expect(() => JSON.parse(output)).not.toThrow();
  });
});

describe('hashForLog', () => {
  it('is stable for the same input and different for another', async () => {
    const a = await hashForLog('203.0.113.7');
    const b = await hashForLog('203.0.113.7');
    const c = await hashForLog('203.0.113.8');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('does not contain the original value', async () => {
    const hash = await hashForLog('203.0.113.7');
    expect(hash).not.toContain('203.0.113.7');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });
});
