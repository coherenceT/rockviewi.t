import { pathwayName } from '../../shared/courses';
import { renderConfirmationEmail } from '../../shared/emailTemplates';
import type { SubmissionPayload } from '../../shared/validation';
import type { DocumentType } from '../../shared/types';
import { ConfigurationError } from '../lib/errors';
import { encryptField, hashIdNumber, uuid } from '../lib/crypto';
import { logError, logInfo, logWarn } from '../lib/logger';
import type { EmailModule } from '../email';
import type { NewApplication, SubmissionStore } from '../ports';

/**
 * The critical path: persist an application, store its documents, and send the
 * confirmation email - atomically enough that a failure never leaves a partial
 * application behind, and such that an email failure never loses an
 * application that was successfully saved.
 */

export interface ParsedDocument {
  documentType: DocumentType;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface SubmitLinks {
  /** Absolute site origin, used to build the status, privacy and receipt links. */
  appOrigin: string;
  contactEmail: string;
}

export interface SubmitConfig {
  intakeYear: number;
  consentVersion: string;
  encryptionKey?: string;
  retryAttempts: number;
  retryBackoffMs: readonly number[];
}

export interface SubmitDependencies {
  store: SubmissionStore;
  email: EmailModule;
  config: SubmitConfig;
  links: SubmitLinks;
  now?: () => Date;
  /** Injectable so tests do not actually wait between retries. */
  sleep?: (ms: number) => Promise<void>;
}

export interface SubmitResult {
  applicationId: string;
  referenceNumber: string;
  /** False when the application was saved but the confirmation email failed. */
  emailDelivered: boolean;
}

const EMAIL_PATTERN_IN_TEXT = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** Provider errors can echo the recipient back; never persist that in a log row. */
export function scrubEmailAddresses(value: string): string {
  return value.replace(EMAIL_PATTERN_IN_TEXT, '[redacted-email]').slice(0, 500);
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return typeof error === 'string' ? error : 'Unknown error';
}

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf('.');
  const extension = index === -1 ? 'bin' : filename.slice(index + 1).toLowerCase();
  return extension === 'jpeg' ? 'jpg' : extension;
}

export function buildStoragePath(applicationId: string, documentType: DocumentType, filename: string): string {
  return `${applicationId}/${documentType}/${uuid()}.${extensionOf(filename)}`;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Attempts delivery, retrying with a backoff. The last error is rethrown so the
 * caller can mark the queued email as failed.
 */
async function sendWithRetry(
  email: EmailModule,
  message: Parameters<EmailModule['sendEmail']>[0],
  attempts: number,
  backoffMs: readonly number[],
  sleep: (ms: number) => Promise<void>,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await email.sendEmail(message);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(backoffMs[attempt - 1] ?? 0);
      }
    }
  }
  throw lastError;
}

export async function submitApplication(
  payload: SubmissionPayload,
  documents: readonly ParsedDocument[],
  deps: SubmitDependencies,
): Promise<SubmitResult> {
  const { store, email, config, links } = deps;
  const now = deps.now?.() ?? new Date();
  const sleep = deps.sleep ?? defaultSleep;
  const timestamp = now.toISOString();

  // Sensitive field handling. If an ID number was supplied we encrypt it, and
  // if we cannot encrypt it we refuse rather than fall back to plaintext.
  let idNumberCiphertext: string | null = null;
  let idNumberHash: string | null = null;
  if (payload.idNumber) {
    if (!config.encryptionKey) {
      throw new ConfigurationError(
        'FIELD_ENCRYPTION_KEY is not configured, so the ID number cannot be stored safely. Set the secret and try again.',
      );
    }
    idNumberCiphertext = await encryptField(payload.idNumber, config.encryptionKey);
    idNumberHash = await hashIdNumber(payload.idNumber);
  }

  const newApplication: NewApplication = {
    status: 'received',
    pathway: payload.pathway,
    startDate: payload.startDate,
    paymentOption: payload.paymentOption,
    programmeMode: 'full_time',
    firstName: payload.firstName,
    surname: payload.surname,
    dateOfBirth: payload.dateOfBirth,
    idNumberCiphertext,
    idNumberHash,
    email: payload.email,
    mobile: payload.mobile,
    city: payload.city,
    suburb: payload.suburb,
    highestQualification: payload.highestQualification,
    schoolName: payload.schoolName,
    yearCompleted: payload.yearCompleted,
    matricResultsSummary: payload.matricResultsSummary ?? null,
    guardianName: payload.guardianName ?? null,
    guardianRelationship: payload.guardianRelationship ?? null,
    guardianPhone: payload.guardianPhone ?? null,
    guardianEmail: payload.guardianEmail ?? null,
    informationTrueAt: timestamp,
    popiaConsentAt: timestamp,
    marketingConsent: payload.marketingConsent === true,
    marketingConsentAt: payload.marketingConsent === true ? timestamp : null,
    termsAcceptedAt: timestamp,
    consentVersion: config.consentVersion,
    source: payload.source,
  };

  let created: { id: string; referenceNumber: string } | null = null;
  const uploadedPaths: string[] = [];

  try {
    created = await store.createApplication(newApplication);

    for (const document of documents) {
      const storagePath = buildStoragePath(created.id, document.documentType, document.filename);
      await store.uploadObject(storagePath, document.bytes, document.mimeType);
      uploadedPaths.push(storagePath);
    }

    if (documents.length > 0) {
      await store.addDocuments(
        documents.map((document, index) => ({
          applicationId: created!.id,
          documentType: document.documentType,
          storagePath: uploadedPaths[index]!,
          mimeType: document.mimeType,
          sizeBytes: document.bytes.byteLength,
        })),
      );
    }

    await store.addEvent({
      applicationId: created.id,
      eventType: 'submitted',
      toStatus: 'received',
      actorLabel: 'applicant',
      note: `Application received with ${documents.length} document(s).`,
    });
  } catch (error) {
    // Nothing partial may survive: remove uploaded objects, then the row, which
    // cascades to any document or event rows already written.
    await rollback(store, created?.id ?? null, uploadedPaths);
    logError('application_submission_failed', { documents: documents.length, pathway: payload.pathway }, error);
    throw error;
  }

  const referenceNumber = created.referenceNumber;
  const statusUrl = `${links.appOrigin}/status`;
  const privacyUrl = `${links.appOrigin}/privacy`;
  const unsubscribeUrl = `mailto:${links.contactEmail}?subject=Unsubscribe%20from%20school%20updates`;

  const rendered = renderConfirmationEmail({
    referenceNumber,
    pathwayName: pathwayName(payload.pathway),
    firstName: payload.firstName,
    statusUrl,
    privacyUrl,
    marketingConsent: payload.marketingConsent === true,
    unsubscribeUrl,
  });

  // From here the application is already safely saved. The email is the only
  // thing left, and its failure is recorded rather than rolled back.
  const queued = await store.queueEmail({
    applicationId: created.id,
    toAddress: payload.email,
    template: 'application_received',
    subject: rendered.subject,
  });

  await store.addEvent({
    applicationId: created.id,
    eventType: 'email_queued',
    actorLabel: 'system',
    note: 'application_received',
  });

  let emailDelivered = false;
  try {
    const result = await sendWithRetry(
      email,
      {
        to: payload.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        template: 'application_received',
      },
      config.retryAttempts,
      config.retryBackoffMs,
      sleep,
    );

    await store.markEmailSent(queued.id, email.provider, result.providerMessageId);
    await store.addEvent({
      applicationId: created.id,
      eventType: 'email_sent',
      actorLabel: 'system',
      note: 'application_received',
    });
    emailDelivered = true;
    logInfo('application_submitted', { pathway: payload.pathway, documents: documents.length, status: 'email_sent' });
  } catch (error) {
    const message = scrubEmailAddresses(describeError(error));
    await store.markEmailFailed(queued.id, message, config.retryAttempts);
    await store.addEvent({
      applicationId: created.id,
      eventType: 'email_failed',
      actorLabel: 'system',
      note: message,
    });
    logWarn('confirmation_email_failed', {
      attempts: config.retryAttempts,
      provider: email.provider,
      template: 'application_received',
    });
  }

  return { applicationId: created.id, referenceNumber, emailDelivered };
}

async function rollback(
  store: SubmissionStore,
  applicationId: string | null,
  uploadedPaths: readonly string[],
): Promise<void> {
  try {
    if (uploadedPaths.length > 0) {
      await store.deleteObjects(uploadedPaths);
    }
  } catch (error) {
    logError('application_rollback_objects_failed', { count: uploadedPaths.length }, error);
  }

  if (!applicationId) return;

  try {
    await store.deleteApplication(applicationId);
  } catch (error) {
    logError('application_rollback_row_failed', { reason: 'delete_failed' }, error);
  }
}
