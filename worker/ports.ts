import type { ApplicationEventType, ApplicationStatus, DocumentType, PaymentOption, PathwayId } from '../shared/types';

/**
 * The seam between the submission logic and Supabase.
 *
 * The service depends on this interface rather than on a Supabase client, so
 * the whole submission flow - including rollback and email retries - is
 * testable without credentials or a network.
 */

export interface NewApplication {
  status: ApplicationStatus;
  pathway: PathwayId;
  startDate: string;
  paymentOption: PaymentOption;
  programmeMode: 'full_time';
  firstName: string;
  surname: string;
  dateOfBirth: string;
  /** base64 AES-256-GCM ciphertext, or null when the applicant did not supply one. */
  idNumberCiphertext: string | null;
  idNumberHash: string | null;
  email: string;
  mobile: string;
  city: string;
  suburb: string;
  highestQualification: string;
  schoolName: string;
  yearCompleted: number;
  matricResultsSummary: string | null;
  guardianName: string | null;
  guardianRelationship: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  informationTrueAt: string;
  popiaConsentAt: string;
  marketingConsent: boolean;
  marketingConsentAt: string | null;
  termsAcceptedAt: string;
  consentVersion: string;
  source: string;
}

export interface NewDocument {
  applicationId: string;
  documentType: DocumentType;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

export interface NewApplicationEvent {
  applicationId: string;
  eventType: ApplicationEventType;
  fromStatus?: ApplicationStatus | null;
  toStatus?: ApplicationStatus | null;
  actorId?: string | null;
  actorLabel?: string | null;
  note?: string | null;
}

export interface NewOutboundEmail {
  applicationId: string;
  toAddress: string;
  template: string;
  subject: string;
}

export interface CreatedApplication {
  id: string;
  referenceNumber: string;
}

export interface SubmissionStore {
  createApplication(input: NewApplication): Promise<CreatedApplication>;
  deleteApplication(applicationId: string): Promise<void>;
  uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  deleteObjects(paths: readonly string[]): Promise<void>;
  addDocuments(rows: readonly NewDocument[]): Promise<void>;
  addEvent(event: NewApplicationEvent): Promise<void>;
  queueEmail(row: NewOutboundEmail): Promise<{ id: string }>;
  markEmailSent(id: string, provider: string, providerMessageId: string | null): Promise<void>;
  markEmailFailed(id: string, error: string, attempts: number): Promise<void>;
}
