import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { serviceClient } from '../lib/supabase';
import { decryptField, toArrayBuffer } from '../lib/crypto';
import { ConfigurationError } from '../lib/errors';
import type {
  NewApplication,
  NewApplicationEvent,
  NewDocument,
  NewOutboundEmail,
  SubmissionStore,
} from '../ports';
import type { ApplicationStatus, DocumentType } from '../../shared/types';

/**
 * Data access that must run on the server.
 *
 * The split is deliberate:
 *
 *  - The Worker (service key) handles public submission, the documents bucket,
 *    signed URLs, ID-number decryption and POPIA deletion. These are the
 *    operations that need a secret or elevated rights.
 *  - Signed-in staff read applications, change status and add notes straight
 *    from the admin UI with their own Supabase Auth JWT, gated by row level
 *    security. That path is important: the audit trigger can only record who
 *    changed a status if the change really is made as that user, and a request
 *    made with the service key has no user attached.
 *
 * The browser is never given the service key.
 */

export const DOCUMENTS_BUCKET = 'application-documents';

function fail(operation: string, message: string | undefined): never {
  throw new Error(`Supabase ${operation} failed: ${message ?? 'unknown error'}`);
}

/* -------------------------------------------------------------------------- */
/* Submission store - the write path used by the critical path                 */
/* -------------------------------------------------------------------------- */

export function createSubmissionStore(env: Env): SubmissionStore {
  const client: SupabaseClient = serviceClient(env);

  return {
    async createApplication(input: NewApplication) {
      const { data, error } = await client
        .from('applications')
        .insert({
          status: input.status,
          pathway: input.pathway,
          start_date: input.startDate,
          payment_option: input.paymentOption,
          programme_mode: input.programmeMode,
          first_name: input.firstName,
          surname: input.surname,
          date_of_birth: input.dateOfBirth,
          id_number: input.idNumberCiphertext,
          id_number_hash: input.idNumberHash,
          email: input.email,
          mobile: input.mobile,
          city: input.city,
          suburb: input.suburb,
          highest_qualification: input.highestQualification,
          school_name: input.schoolName,
          year_completed: input.yearCompleted,
          matric_results_summary: input.matricResultsSummary,
          guardian_name: input.guardianName,
          guardian_relationship: input.guardianRelationship,
          guardian_phone: input.guardianPhone,
          guardian_email: input.guardianEmail,
          information_true_at: input.informationTrueAt,
          popia_consent_at: input.popiaConsentAt,
          marketing_consent: input.marketingConsent,
          marketing_consent_at: input.marketingConsentAt,
          terms_accepted_at: input.termsAcceptedAt,
          consent_version: input.consentVersion,
          source: input.source,
        })
        .select('id, reference_number')
        .single();

      if (error || !data) fail('insert', error?.message);
      // reference_number is assigned by the database trigger, not by this code.
      return { id: data.id as string, referenceNumber: data.reference_number as string };
    },

    async deleteApplication(applicationId: string) {
      const { error } = await client.from('applications').delete().eq('id', applicationId);
      if (error) fail('delete', error.message);
    },

    async uploadObject(path: string, bytes: Uint8Array, contentType: string) {
      const { error } = await client.storage
        .from(DOCUMENTS_BUCKET)
        .upload(path, new Blob([toArrayBuffer(bytes)], { type: contentType }), { contentType, upsert: false });
      if (error) fail('storage upload', error.message);
    },

    async deleteObjects(paths: readonly string[]) {
      if (paths.length === 0) return;
      const { error } = await client.storage.from(DOCUMENTS_BUCKET).remove([...paths]);
      if (error) fail('storage remove', error.message);
    },

    async addDocuments(rows: readonly NewDocument[]) {
      const { error } = await client.from('application_documents').insert(
        rows.map((row) => ({
          application_id: row.applicationId,
          document_type: row.documentType,
          storage_path: row.storagePath,
          mime_type: row.mimeType,
          size_bytes: row.sizeBytes,
        })),
      );
      if (error) fail('document insert', error.message);
    },

    async addEvent(event: NewApplicationEvent) {
      const { error } = await client.from('application_events').insert({
        application_id: event.applicationId,
        event_type: event.eventType,
        from_status: event.fromStatus ?? null,
        to_status: event.toStatus ?? null,
        actor_id: event.actorId ?? null,
        actor_label: event.actorLabel ?? null,
        note: event.note ?? null,
      });
      if (error) fail('event insert', error.message);
    },

    async queueEmail(row: NewOutboundEmail) {
      const { data, error } = await client
        .from('outbound_emails')
        .insert({
          application_id: row.applicationId,
          to_address: row.toAddress,
          template: row.template,
          subject: row.subject,
          status: 'queued',
        })
        .select('id')
        .single();
      if (error || !data) fail('email queue', error?.message);
      return { id: data.id as string };
    },

    async markEmailSent(id: string, provider: string, providerMessageId: string | null) {
      const { error } = await client
        .from('outbound_emails')
        .update({
          status: 'sent',
          provider,
          provider_message_id: providerMessageId,
          sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', id);
      if (error) fail('email update', error.message);
    },

    async markEmailFailed(id: string, error: string, attempts: number) {
      const { error: updateError } = await client
        .from('outbound_emails')
        .update({ status: 'failed', last_error: error, attempts })
        .eq('id', id);
      if (updateError) fail('email update', updateError.message);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Public reads                                                                */
/* -------------------------------------------------------------------------- */

export interface StatusLookupResult {
  status: ApplicationStatus;
}

/**
 * Returns the status and nothing else. The email address is part of the query,
 * so knowing a reference number alone is not enough to read someone's status.
 */
export async function lookupStatus(
  env: Env,
  referenceNumber: string,
  email: string,
): Promise<StatusLookupResult | null> {
  const client = serviceClient(env);
  const { data, error } = await client
    .from('applications')
    .select('status')
    .eq('reference_number', referenceNumber)
    .eq('email', email)
    .maybeSingle();

  if (error) fail('status lookup', error.message);
  if (!data) return null;
  return { status: data.status as ApplicationStatus };
}

export async function readEarlyBirdCount(env: Env): Promise<number> {
  const client = serviceClient(env);
  const { data, error } = await client
    .from('early_bird_counter')
    .select('paid_count')
    .eq('id', 1)
    .maybeSingle();

  // A missing row is not worth failing the landing page over.
  if (error) fail('early bird read', error.message);
  return (data?.paid_count as number | undefined) ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Staff-only operations that need the service key                             */
/* -------------------------------------------------------------------------- */

/** Decrypted on the server for staff only; never returned by any public route. */
export async function readIdNumberForStaff(env: Env, applicationId: string): Promise<string | null> {
  const client = serviceClient(env);
  const { data, error } = await client
    .from('applications')
    .select('id_number')
    .eq('id', applicationId)
    .maybeSingle();

  if (error) fail('id number read', error.message);
  if (!data?.id_number) return null;
  if (!env.FIELD_ENCRYPTION_KEY) {
    throw new ConfigurationError('FIELD_ENCRYPTION_KEY is not configured, so the ID number cannot be decrypted.');
  }
  return decryptField(data.id_number as string, env.FIELD_ENCRYPTION_KEY);
}

export interface SignedUrlResult {
  url: string;
  expiresAt: string;
  downloadName: string;
  documentType: DocumentType;
}

export async function createDocumentSignedUrl(
  env: Env,
  documentId: string,
  expiresInSeconds: number,
): Promise<SignedUrlResult | null> {
  const client = serviceClient(env);
  const { data: document, error } = await client
    .from('application_documents')
    .select('storage_path, document_type, mime_type')
    .eq('id', documentId)
    .maybeSingle();

  if (error) fail('document lookup', error.message);
  if (!document) return null;

  const storagePath = document.storage_path as string;
  const extension = storagePath.split('.').pop() ?? 'bin';
  const documentType = document.document_type as DocumentType;
  const downloadName = `${documentType}.${extension}`;

  const { data, error: signError } = await client.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds, { download: downloadName });

  if (signError || !data) fail('signed url', signError?.message);

  return {
    url: data.signedUrl,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    downloadName,
    documentType,
  };
}

export interface DeletionSummary {
  referenceNumber: string;
  documentsDeleted: number;
}

/**
 * POPIA deletion on request: removes the storage objects, then the application
 * row (which cascades to documents, events and queued email), then records that
 * the deletion happened - without retaining the deleted personal data.
 */
export async function deleteApplicationData(
  env: Env,
  params: { id: string; actorId: string; actorLabel: string | null; reason: string | null },
): Promise<DeletionSummary | null> {
  const client = serviceClient(env);

  const { data: application, error } = await client
    .from('applications')
    .select('id, reference_number')
    .eq('id', params.id)
    .maybeSingle();

  if (error) fail('deletion lookup', error.message);
  if (!application) return null;

  const { data: documents, error: documentError } = await client
    .from('application_documents')
    .select('storage_path')
    .eq('application_id', params.id);

  if (documentError) fail('deletion documents', documentError.message);

  const paths = (documents ?? []).map((row) => row.storage_path as string);
  if (paths.length > 0) {
    const { error: removeError } = await client.storage.from(DOCUMENTS_BUCKET).remove(paths);
    if (removeError) fail('deletion storage', removeError.message);
  }

  const { error: deleteError } = await client.from('applications').delete().eq('id', params.id);
  if (deleteError) fail('deletion row', deleteError.message);

  const { error: logError } = await client.from('data_deletion_log').insert({
    reference_number: application.reference_number as string,
    deleted_by: params.actorId,
    deleted_by_email: params.actorLabel,
    documents_deleted: paths.length,
    reason: params.reason,
  });
  if (logError) fail('deletion log', logError.message);

  return {
    referenceNumber: application.reference_number as string,
    documentsDeleted: paths.length,
  };
}

/* -------------------------------------------------------------------------- */

export function assertConfigured(env: Env): void {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ConfigurationError(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set as Cloudflare secrets before the API can store applications.',
    );
  }
}
