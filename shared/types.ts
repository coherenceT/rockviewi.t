/** Domain enums shared by the browser, the Worker and the tests. */

export const PATHWAY_IDS = ['a', 'b', 'c'] as const;
export type PathwayId = (typeof PATHWAY_IDS)[number];

export const PAYMENT_OPTIONS = ['monthly', 'upfront', 'early_bird', 'sponsored'] as const;
export type PaymentOption = (typeof PAYMENT_OPTIONS)[number];

export const APPLICATION_STATUSES = [
  'received',
  'under_review',
  'accepted_payment_pending',
  'not_successful',
  'waitlisted',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const DOCUMENT_TYPES = ['certified_id', 'highest_qualification', 'proof_of_residence'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const OPTIONAL_DOCUMENT_TYPES: readonly DocumentType[] = ['proof_of_residence'];

export const APPLICATION_EVENT_TYPES = [
  'submitted',
  'status_changed',
  'note_added',
  'document_uploaded',
  'email_queued',
  'email_sent',
  'email_failed',
  'data_deleted',
] as const;
export type ApplicationEventType = (typeof APPLICATION_EVENT_TYPES)[number];

export interface ApplicationDocumentRecord {
  id: string;
  application_id: string;
  document_type: DocumentType;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface ApplicationRecord {
  id: string;
  reference_number: string;
  status: ApplicationStatus;
  pathway: PathwayId;
  start_date: string;
  payment_option: PaymentOption;
  first_name: string;
  surname: string;
  date_of_birth: string;
  id_number: string | null;
  id_number_hash: string | null;
  email: string;
  mobile: string;
  city: string;
  suburb: string;
  highest_qualification: string;
  school_name: string;
  year_completed: number;
  matric_results_summary: string | null;
  guardian_name: string | null;
  guardian_relationship: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;
  information_true_at: string;
  popia_consent_at: string;
  marketing_consent_at: string | null;
  terms_accepted_at: string;
  consent_version: string;
  source: string;
  retention_until: string | null;
  created_at: string;
  updated_at: string;
}
