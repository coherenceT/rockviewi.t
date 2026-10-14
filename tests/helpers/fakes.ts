import { formatReferenceNumber } from '../../shared/reference';
import type { EmailModule } from '../../worker/email';
import type { EmailAdapter, EmailMessage, EmailSendResult } from '../../worker/email/types';
import type {
  CreatedApplication,
  NewApplication,
  NewApplicationEvent,
  NewDocument,
  NewOutboundEmail,
  SubmissionStore,
} from '../../worker/ports';

/**
 * Test doubles for the submission flow.
 *
 * The service depends on ports rather than on Supabase, so the whole critical
 * path - including rollback behaviour and email retries - is exercised here
 * with no credentials and no network.
 */

export interface FakeOptions {
  intakeYear?: number;
  failOn?: Partial<Record<FailurePoint, number>>;
}

export type FailurePoint =
  | 'createApplication'
  | 'uploadObject'
  | 'addDocuments'
  | 'addEvent'
  | 'queueEmail'
  | 'markEmailSent'
  | 'markEmailFailed';

export class FakeSubmissionStore implements SubmissionStore {
  readonly applications = new Map<string, NewApplication>();
  readonly documents: Array<NewDocument & { id: string }> = [];
  readonly events: NewApplicationEvent[] = [];
  readonly emails: Array<NewOutboundEmail & { id: string; status: string; attempts: number; lastError: string | null; provider: string | null; providerMessageId: string | null }> = [];
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  readonly calls: string[] = [];

  private readonly intakeYear: number;
  private readonly failOn: Partial<Record<FailurePoint, number>>;
  private readonly failures = new Map<FailurePoint, number>();
  private sequence = 0;

  constructor(options: FakeOptions = {}) {
    this.intakeYear = options.intakeYear ?? 2027;
    this.failOn = options.failOn ?? {};
  }

  private maybeFail(point: FailurePoint): void {
    const limit = this.failOn[point];
    if (limit === undefined) return;

    const used = (this.failures.get(point) ?? 0) + 1;
    this.failures.set(point, used);
    if (used <= limit) throw new Error(`injected failure at ${point} (attempt ${used})`);
  }

  async createApplication(input: NewApplication): Promise<CreatedApplication> {
    this.calls.push('createApplication');
    this.maybeFail('createApplication');
    this.sequence += 1;
    const id = `00000000-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`;
    this.applications.set(id, input);
    return { id, referenceNumber: formatReferenceNumber(this.intakeYear, this.sequence) };
  }

  async deleteApplication(applicationId: string): Promise<void> {
    this.calls.push('deleteApplication');
    this.applications.delete(applicationId);
    // Mirrors the ON DELETE CASCADE in the migration.
    for (let index = this.documents.length - 1; index >= 0; index -= 1) {
      if (this.documents[index]!.applicationId === applicationId) this.documents.splice(index, 1);
    }
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      if (this.events[index]!.applicationId === applicationId) this.events.splice(index, 1);
    }
    for (let index = this.emails.length - 1; index >= 0; index -= 1) {
      if (this.emails[index]!.applicationId === applicationId) this.emails.splice(index, 1);
    }
  }

  async uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.calls.push(`uploadObject:${path}`);
    this.maybeFail('uploadObject');
    this.objects.set(path, { bytes, contentType });
  }

  async deleteObjects(paths: readonly string[]): Promise<void> {
    this.calls.push('deleteObjects');
    for (const path of paths) this.objects.delete(path);
  }

  async addDocuments(rows: readonly NewDocument[]): Promise<void> {
    this.calls.push('addDocuments');
    this.maybeFail('addDocuments');
    for (const row of rows) this.documents.push({ ...row, id: `doc-${this.documents.length + 1}` });
  }

  async addEvent(event: NewApplicationEvent): Promise<void> {
    this.calls.push(`addEvent:${event.eventType}`);
    this.maybeFail('addEvent');
    this.events.push(event);
  }

  async queueEmail(row: NewOutboundEmail): Promise<{ id: string }> {
    this.calls.push('queueEmail');
    this.maybeFail('queueEmail');
    const id = `email-${this.emails.length + 1}`;
    this.emails.push({
      ...row,
      id,
      status: 'queued',
      attempts: 0,
      lastError: null,
      provider: null,
      providerMessageId: null,
    });
    return { id };
  }

  async markEmailSent(id: string, provider: string, providerMessageId: string | null): Promise<void> {
    this.calls.push('markEmailSent');
    this.maybeFail('markEmailSent');
    const email = this.emails.find((row) => row.id === id);
    if (!email) throw new Error('unknown email id');
    email.status = 'sent';
    email.provider = provider;
    email.providerMessageId = providerMessageId;
  }

  async markEmailFailed(id: string, error: string, attempts: number): Promise<void> {
    this.calls.push('markEmailFailed');
    this.maybeFail('markEmailFailed');
    const email = this.emails.find((row) => row.id === id);
    if (!email) throw new Error('unknown email id');
    email.status = 'failed';
    email.lastError = error;
    email.attempts = attempts;
  }
}

export interface FakeEmail extends EmailModule {
  readonly sent: EmailMessage[];
  attempts: number;
}

export function createFakeEmail(options: { failTimes?: number } = {}): FakeEmail {
  const sent: EmailMessage[] = [];
  let attempts = 0;
  const alwaysFail = options.failTimes === Number.POSITIVE_INFINITY;

  const adapter: EmailAdapter = {
    name: 'fake',
    async send(message: EmailMessage): Promise<EmailSendResult> {
      attempts += 1;
      if (alwaysFail || attempts <= (options.failTimes ?? 0)) {
        throw new Error('provider rejected the message for thandi@example.com');
      }
      sent.push(message);
      return { providerMessageId: `fake-${attempts}` };
    },
  };

  return {
    provider: adapter.name,
    sent,
    get attempts() {
      return attempts;
    },
    sendEmail: (message: EmailMessage) => adapter.send(message),
  };
}

interface FakeKvEntry {
  value: string;
  expiresAt: number | null;
}

/** Minimal in-memory stand-in for the KV namespace used by the rate limiter. */
export class FakeKV {
  private readonly entries = new Map<string, FakeKvEntry>();

  async get(key: string, type?: 'text' | 'json'): Promise<unknown> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return type === 'json' ? JSON.parse(entry.value) : entry.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const ttl = options?.expirationTtl;
    this.entries.set(key, {
      value,
      expiresAt: typeof ttl === 'number' ? Date.now() + ttl * 1000 : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  /** Test helper: jump the stored entries forward in time. */
  expireNow(): void {
    for (const [key, entry] of this.entries) {
      entry.expiresAt = Date.now() - 1;
      this.entries.set(key, entry);
    }
  }

  asKVNamespace(): KVNamespace {
    return this as unknown as KVNamespace;
  }
}
