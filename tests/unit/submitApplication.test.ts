import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitApplication, scrubEmailAddresses, type ParsedDocument, type SubmitDependencies } from '../../worker/services/submitApplication';
import { submissionPayloadSchema, type SubmissionPayload } from '../../shared/validation';
import { programme } from '../../shared/config';
import { generateKeyBase64 } from '../../worker/lib/crypto';
import { REFERENCE_PATTERN } from '../../shared/reference';
import { createFakeEmail, FakeSubmissionStore, type FailurePoint, type FakeEmail } from '../helpers/fakes';

const ENCRYPTION_KEY = generateKeyBase64();
const FIXED_NOW = new Date('2027-01-05T09:00:00.000Z');

function payload(overrides: Record<string, unknown> = {}): SubmissionPayload {
  const result = submissionPayloadSchema.safeParse({
    firstName: 'Thandi',
    surname: 'Mkhize',
    dateOfBirth: '2005-03-14',
    idNumber: '9001015800089',
    email: 'thandi@example.com',
    mobile: '0821234567',
    city: 'Pietermaritzburg',
    suburb: 'Northdale',
    highestQualification: 'National Senior Certificate',
    schoolName: 'Northdale Secondary School',
    yearCompleted: 2023,
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
  });

  if (!result.success) throw new Error(`fixture is invalid: ${JSON.stringify(result.error.issues)}`);
  return result.data;
}

function documents(): ParsedDocument[] {
  return [
    {
      documentType: 'certified_id',
      filename: 'id-copy.pdf',
      mimeType: 'application/pdf',
      bytes: new Uint8Array([1, 2, 3, 4]),
    },
    {
      documentType: 'highest_qualification',
      filename: 'matric.JPG',
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([5, 6, 7]),
    },
  ];
}

interface Harness {
  store: FakeSubmissionStore;
  email: FakeEmail;
  sleeps: number[];
  deps: SubmitDependencies;
}

function harness(options: {
  failOn?: Partial<Record<FailurePoint, number>>;
  emailFailTimes?: number;
  encryptionKey?: string | undefined;
} = {}): Harness {
  const store = new FakeSubmissionStore({ intakeYear: 2027, failOn: options.failOn ?? {} });
  const email = createFakeEmail({ failTimes: options.emailFailTimes ?? 0 });
  const sleeps: number[] = [];

  const deps: SubmitDependencies = {
    store,
    email,
    config: {
      intakeYear: 2027,
      consentVersion: 'draft-1-unapproved',
      encryptionKey: 'encryptionKey' in options ? options.encryptionKey : ENCRYPTION_KEY,
      retryAttempts: 3,
      retryBackoffMs: [250, 750],
    },
    links: { appOrigin: 'https://school.example', contactEmail: 'admissions@example.invalid' },
    now: () => FIXED_NOW,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  };

  return { store, email, sleeps, deps };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('submitApplication - happy path', () => {
  it('creates the application, stores the documents, audits and sends the email', async () => {
    const { store, email, deps } = harness();
    const result = await submitApplication(payload(), documents(), deps);

    expect(result.referenceNumber).toMatch(REFERENCE_PATTERN);
    expect(result.emailDelivered).toBe(true);

    expect(store.applications.size).toBe(1);
    const stored = store.applications.get(result.applicationId)!;
    expect(stored.status).toBe('received');
    expect(stored.pathway).toBe('a');
    expect(stored.paymentOption).toBe('monthly');
    expect(stored.email).toBe('thandi@example.com');
    expect(stored.consentVersion).toBe('draft-1-unapproved');

    expect(store.objects.size).toBe(2);
    expect(store.documents).toHaveLength(2);
    expect(email.sent).toHaveLength(1);
  });

  it('writes the audit event and the queued email row', async () => {
    const { store, deps } = harness();
    await submitApplication(payload(), documents(), deps);

    const eventTypes = store.events.map((event) => event.eventType);
    expect(eventTypes).toContain('submitted');
    expect(eventTypes).toContain('email_queued');
    expect(eventTypes).toContain('email_sent');

    const submitted = store.events.find((event) => event.eventType === 'submitted')!;
    expect(submitted.toStatus).toBe('received');
    expect(submitted.actorLabel).toBe('applicant');

    expect(store.emails).toHaveLength(1);
    expect(store.emails[0]!.status).toBe('sent');
    expect(store.emails[0]!.template).toBe('application_received');
    expect(store.emails[0]!.providerMessageId).toBeTruthy();
  });

  it('persists in a safe order: application, uploads, document rows, audit, email', async () => {
    const { store, deps } = harness();
    await submitApplication(payload(), documents(), deps);

    const ordered = store.calls.filter((call) =>
      ['createApplication', 'addDocuments', 'queueEmail', 'markEmailSent'].includes(call) || call.startsWith('uploadObject'),
    );

    expect(ordered[0]).toBe('createApplication');
    expect(ordered.filter((call) => call.startsWith('uploadObject'))).toHaveLength(2);
    expect(ordered.indexOf('addDocuments')).toBeGreaterThan(ordered.lastIndexOf(ordered.find((call) => call.startsWith('uploadObject'))!));
    expect(ordered.indexOf('queueEmail')).toBeGreaterThan(ordered.indexOf('addDocuments'));
    expect(ordered.indexOf('markEmailSent')).toBeGreaterThan(ordered.indexOf('queueEmail'));
  });

  it('names stored objects as {applicationId}/{documentType}/{uuid}.{ext}', async () => {
    const { store, deps } = harness();
    const result = await submitApplication(payload(), documents(), deps);

    const paths = Array.from(store.objects.keys());
    expect(paths).toHaveLength(2);
    for (const path of paths) {
      expect(path).toMatch(
        new RegExp(`^${result.applicationId}/(certified_id|highest_qualification)/[0-9a-f-]{36}\\.(pdf|jpg)$`),
      );
    }
    expect(paths.some((path) => path.endsWith('.jpg'))).toBe(true);
  });

  it('records the byte size that was actually uploaded', async () => {
    const { store, deps } = harness();
    await submitApplication(payload(), documents(), deps);

    const sizes = store.documents.map((document) => document.sizeBytes).sort((a, b) => a - b);
    expect(sizes).toEqual([3, 4]);
  });

  it('works with no documents attached', async () => {
    const { store, deps } = harness();
    const result = await submitApplication(payload(), [], deps);

    expect(result.emailDelivered).toBe(true);
    expect(store.objects.size).toBe(0);
    expect(store.documents).toHaveLength(0);
    expect(store.calls).not.toContain('addDocuments');
  });
});

describe('submitApplication - sensitive field handling', () => {
  it('stores the ID number as ciphertext and keeps a hash for matching', async () => {
    const { store, deps } = harness();
    const result = await submitApplication(payload(), [], deps);

    const stored = store.applications.get(result.applicationId)!;
    expect(stored.idNumberCiphertext).toBeTruthy();
    expect(stored.idNumberCiphertext).not.toContain('9001015800089');
    expect(stored.idNumberHash).toMatch(/^[0-9a-f]{64}$/);

    // The plaintext must not appear anywhere in the persisted record.
    expect(JSON.stringify(stored)).not.toContain('9001015800089');
  });

  it('leaves both fields null when no ID or passport number was supplied', async () => {
    const { store, deps } = harness();
    const result = await submitApplication(payload({ idNumber: '' }), [], deps);

    const stored = store.applications.get(result.applicationId)!;
    expect(stored.idNumberCiphertext).toBeNull();
    expect(stored.idNumberHash).toBeNull();
  });

  it('refuses to store an ID number when the encryption key is missing', async () => {
    const { store, deps } = harness({ encryptionKey: undefined });

    await expect(submitApplication(payload(), documents(), deps)).rejects.toThrow(/FIELD_ENCRYPTION_KEY/);

    // Failing closed means nothing at all is written.
    expect(store.applications.size).toBe(0);
    expect(store.objects.size).toBe(0);
    expect(store.calls).toHaveLength(0);
  });

  it('still accepts an application with no ID number when no key is configured', async () => {
    const { store, deps } = harness({ encryptionKey: undefined });
    const result = await submitApplication(payload({ idNumber: '' }), [], deps);

    expect(result.referenceNumber).toMatch(REFERENCE_PATTERN);
    // Nothing sensitive to protect, so the missing key is not a problem.
    expect(store.applications.get(result.applicationId)!.idNumberCiphertext).toBeNull();
  });
});

describe('submitApplication - consent record', () => {
  it('stamps every consent with the submission time and the consent version', async () => {
    const { store, deps } = harness();
    const result = await submitApplication(payload(), [], deps);
    const stored = store.applications.get(result.applicationId)!;

    expect(stored.informationTrueAt).toBe(FIXED_NOW.toISOString());
    expect(stored.popiaConsentAt).toBe(FIXED_NOW.toISOString());
    expect(stored.termsAcceptedAt).toBe(FIXED_NOW.toISOString());
    expect(stored.consentVersion).toBe('draft-1-unapproved');
    expect(stored.marketingConsent).toBe(false);
    expect(stored.marketingConsentAt).toBeNull();
  });

  it('records a timestamp when marketing consent was given', async () => {
    const { store, deps } = harness();
    const result = await submitApplication(payload({ marketingConsent: true }), [], deps);
    const stored = store.applications.get(result.applicationId)!;

    expect(stored.marketingConsent).toBe(true);
    expect(stored.marketingConsentAt).toBe(FIXED_NOW.toISOString());
  });

  it('keeps guardian details for a minor', async () => {
    const { store, deps } = harness();
    const result = await submitApplication(
      payload({
        dateOfBirth: '2010-03-14',
        guardianName: 'Nomsa Mkhize',
        guardianRelationship: 'Mother',
        guardianPhone: '0837654321',
        guardianEmail: 'nomsa@example.com',
      }),
      [],
      deps,
    );

    const stored = store.applications.get(result.applicationId)!;
    expect(stored.guardianName).toBe('Nomsa Mkhize');
    expect(stored.guardianEmail).toBe('nomsa@example.com');
  });
});

describe('submitApplication - rollback', () => {
  it('leaves nothing behind when the first upload fails', async () => {
    const { deps } = harness();
    const failing = new FakeSubmissionStore({ intakeYear: 2027, failOn: { uploadObject: 1 } });

    await expect(submitApplication(payload(), documents(), { ...deps, store: failing })).rejects.toThrow();

    expect(failing.applications.size).toBe(0);
    expect(failing.objects.size).toBe(0);
    expect(failing.documents).toHaveLength(0);
    expect(failing.events).toHaveLength(0);
    expect(failing.emails).toHaveLength(0);
    expect(failing.calls).toContain('deleteApplication');
  });

  it('removes an object already uploaded when the second upload fails', async () => {
    const { deps } = harness();
    // The first upload succeeds, the second one throws.
    const failing = new FakeSubmissionStore({ intakeYear: 2027 });
    let uploads = 0;
    const originalUpload = failing.uploadObject.bind(failing);
    failing.uploadObject = async (path, bytes, contentType) => {
      uploads += 1;
      if (uploads === 2) throw new Error('injected failure on the second upload');
      return originalUpload(path, bytes, contentType);
    };

    await expect(submitApplication(payload(), documents(), { ...deps, store: failing })).rejects.toThrow();

    // One object made it to storage before the failure, and the rollback must
    // have removed it along with the application row.
    expect(uploads).toBe(2);
    expect(failing.objects.size).toBe(0);
    expect(failing.applications.size).toBe(0);
    expect(failing.calls).toContain('deleteObjects');
    expect(failing.calls).toContain('deleteApplication');
  });

  it('removes objects that were already written when a later step fails', async () => {
    const { deps } = harness();
    const failing = new FakeSubmissionStore({ intakeYear: 2027, failOn: { addDocuments: 1 } });

    await expect(submitApplication(payload(), documents(), { ...deps, store: failing })).rejects.toThrow();

    // The uploads succeeded, so they exist in the upload log, but the rollback
    // must have deleted them and the application row.
    expect(failing.objects.size).toBe(0);
    expect(failing.applications.size).toBe(0);
    expect(failing.calls).toContain('deleteObjects');
    expect(failing.calls).toContain('deleteApplication');
  });

  it('writes nothing when the application row itself cannot be created', async () => {
    const { deps } = harness();
    const failing = new FakeSubmissionStore({ intakeYear: 2027, failOn: { createApplication: 1 } });

    await expect(submitApplication(payload(), documents(), { ...deps, store: failing })).rejects.toThrow();

    expect(failing.applications.size).toBe(0);
    expect(failing.objects.size).toBe(0);
    expect(failing.calls).not.toContain('deleteObjects');
    expect(failing.calls).not.toContain('uploadObject');
  });

  it('never leaves a partial application when the audit insert fails', async () => {
    const { deps } = harness();
    const failing = new FakeSubmissionStore({ intakeYear: 2027, failOn: { addEvent: 1 } });

    await expect(submitApplication(payload(), documents(), { ...deps, store: failing })).rejects.toThrow();

    expect(failing.applications.size).toBe(0);
    expect(failing.objects.size).toBe(0);
  });
});

describe('submitApplication - confirmation email', () => {
  it('retries with a backoff and succeeds within the retry budget', async () => {
    const { store, email, sleeps, deps } = harness({ emailFailTimes: 2 });
    const result = await submitApplication(payload(), [], deps);

    expect(email.attempts).toBe(3);
    expect(sleeps).toEqual([250, 750]);
    expect(result.emailDelivered).toBe(true);
    expect(store.emails[0]!.status).toBe('sent');
  });

  it('keeps the application when the email fails every attempt', async () => {
    const { store, email, deps } = harness({ emailFailTimes: Number.POSITIVE_INFINITY });
    const result = await submitApplication(payload(), documents(), deps);

    // The application is saved regardless; the email failure is recorded for
    // an admin to see.
    expect(result.referenceNumber).toMatch(REFERENCE_PATTERN);
    expect(result.emailDelivered).toBe(false);
    expect(email.attempts).toBe(3);

    expect(store.applications.size).toBe(1);
    expect(store.objects.size).toBe(2);
    expect(store.documents).toHaveLength(2);

    expect(store.emails[0]!.status).toBe('failed');
    expect(store.emails[0]!.attempts).toBe(3);
    expect(store.events.map((event) => event.eventType)).toContain('email_failed');
    expect(store.calls).not.toContain('deleteApplication');
  });

  it('does not leak the recipient address into the stored failure reason', async () => {
    const { store, deps } = harness({ emailFailTimes: Number.POSITIVE_INFINITY });
    await submitApplication(payload(), [], deps);

    const lastError = store.emails[0]!.lastError ?? '';
    expect(lastError).not.toContain('thandi@example.com');
    expect(lastError).toContain('[redacted-email]');
  });

  it('builds the receipt links from the configured origin', async () => {
    const { email, deps } = harness();
    await submitApplication(payload(), [], deps);

    const message = email.sent[0]!;
    expect(message.html).toContain('https://school.example/status');
    expect(message.html).toContain('https://school.example/privacy');
    expect(message.subject).toContain('We have received your application');
    expect(message.text).toMatch(/does not confirm a place/i);
    expect(message.html).not.toMatch(/congratulations|you have been accepted/i);
  });
});

describe('scrubEmailAddresses', () => {
  it('replaces email addresses and truncates long text', () => {
    expect(scrubEmailAddresses('failed for a@b.com')).toBe('failed for [redacted-email]');
    expect(scrubEmailAddresses('x'.repeat(900)).length).toBe(500);
  });
});
