import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Row level security proofs.
 *
 * These run against a real Supabase project - local (`supabase start`) or a
 * staging project - because RLS is enforced by the database, and a mock would
 * prove nothing. Set:
 *
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * and they execute; otherwise they are skipped and reported as skipped.
 *
 * The anon key is a legitimate public credential. The service key is used only
 * to seed and clean up the fixture.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const configured = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY);

const suite = configured ? describe : describe.skip;

/**
 * Both failure modes count as "cannot read": a permission error, or an empty
 * result set. Either way no personal data reaches the caller.
 */
interface ReadAttempt {
  failed: boolean;
  rows: number;
}

async function attemptRead(client: SupabaseClient, table: string): Promise<ReadAttempt> {
  const { data, error } = await client.from(table).select('*').limit(10);
  if (error) return { failed: true, rows: 0 };
  return { failed: false, rows: (data ?? []).length };
}

suite('row level security', () => {
  const marker = `rls-test-${Date.now()}@example.invalid`;
  let service: SupabaseClient;
  let anon: SupabaseClient;
  let applicationId: string | null = null;

  beforeAll(async () => {
    if (!configured) return;
    service = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
    anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });

    const { data, error } = await service
      .from('applications')
      .insert({
        pathway: 'a',
        start_date: '2027-02-01',
        payment_option: 'monthly',
        first_name: 'Rls',
        surname: 'Fixture',
        date_of_birth: '2005-01-01',
        email: marker,
        mobile: '0820000000',
        city: 'Pietermaritzburg',
        suburb: 'Northdale',
        highest_qualification: 'National Senior Certificate',
        school_name: 'Fixture School',
        year_completed: 2023,
        information_true_at: new Date().toISOString(),
        popia_consent_at: new Date().toISOString(),
        terms_accepted_at: new Date().toISOString(),
        consent_version: 'rls-test',
        source: 'rls test',
      })
      .select('id, reference_number')
      .single();

    if (error) throw new Error(`fixture insert failed: ${error.message}`);
    applicationId = data.id as string;

    // One document row so the documents table is genuinely populated. No object
    // is uploaded: the storage check below asserts the bucket is unreachable.
    await service.from('application_documents').insert({
      application_id: applicationId,
      document_type: 'certified_id',
      storage_path: `${applicationId}/certified_id/rls-test.pdf`,
      mime_type: 'application/pdf',
      size_bytes: 1234,
    });

    await service.from('application_events').insert({
      application_id: applicationId,
      event_type: 'submitted',
      to_status: 'received',
      actor_label: 'rls test',
    });

    await service.from('outbound_emails').insert({
      application_id: applicationId,
      to_address: marker,
      template: 'application_received',
      subject: 'RLS fixture',
      status: 'queued',
    });
  });

  afterAll(async () => {
    if (!configured || !applicationId) return;
    // Cascades to documents, events and queued email.
    await service.from('applications').delete().eq('id', applicationId);
  });

  it('the fixture row really exists, so the proofs below are meaningful', async () => {
    const { data, error } = await service.from('applications').select('id').eq('id', applicationId!).maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it('the anon key cannot read applications', async () => {
    const attempt = await attemptRead(anon, 'applications');
    expect(attempt.failed || attempt.rows === 0).toBe(true);
  });

  it('the anon key cannot read application_documents', async () => {
    const attempt = await attemptRead(anon, 'application_documents');
    expect(attempt.failed || attempt.rows === 0).toBe(true);
  });

  it('the anon key cannot read application_events', async () => {
    const attempt = await attemptRead(anon, 'application_events');
    expect(attempt.failed || attempt.rows === 0).toBe(true);
  });

  it('the anon key cannot read outbound_emails', async () => {
    const attempt = await attemptRead(anon, 'outbound_emails');
    expect(attempt.failed || attempt.rows === 0).toBe(true);
  });

  it('the anon key cannot read the staff list', async () => {
    const attempt = await attemptRead(anon, 'staff_users');
    expect(attempt.failed || attempt.rows === 0).toBe(true);
  });

  it('the anon key cannot read the early-bird counter', async () => {
    const attempt = await attemptRead(anon, 'early_bird_counter');
    expect(attempt.failed || attempt.rows === 0).toBe(true);
  });

  it('the anon key cannot read the deletion log', async () => {
    const attempt = await attemptRead(anon, 'data_deletion_log');
    expect(attempt.failed || attempt.rows === 0).toBe(true);
  });

  it('the anon key cannot insert an application directly', async () => {
    const { error } = await anon.from('applications').insert({
      pathway: 'b',
      start_date: '2027-02-01',
      payment_option: 'monthly',
      first_name: 'Direct',
      surname: 'Insert',
      date_of_birth: '2005-01-01',
      email: `direct-${marker}`,
      mobile: '0820000001',
      city: 'Pietermaritzburg',
      suburb: 'Northdale',
      highest_qualification: 'National Senior Certificate',
      school_name: 'Fixture School',
      year_completed: 2023,
      consent_version: 'rls-test',
      source: 'rls test',
    });

    // There is deliberately no INSERT policy for anon: submissions must arrive
    // through the Worker.
    expect(error).not.toBeNull();

    const { data: leaked } = await service
      .from('applications')
      .select('id')
      .eq('email', `direct-${marker}`)
      .maybeSingle();
    expect(leaked).toBeNull();
  });

  it('the anon key cannot change an application status', async () => {
    const { error } = await anon
      .from('applications')
      .update({ status: 'accepted_payment_pending' })
      .eq('id', applicationId!);

    expect(error).not.toBeNull();

    const { data } = await service.from('applications').select('status').eq('id', applicationId!).maybeSingle();
    expect(data?.status).toBe('received');
  });

  it('the anon key cannot update or delete the early-bird counter', async () => {
    const update = await anon.from('early_bird_counter').update({ paid_count: 999 }).eq('id', 1);
    expect(update.error).not.toBeNull();

    const removal = await anon.from('early_bird_counter').delete().eq('id', 1);
    expect(removal.error).not.toBeNull();

    const { data } = await service.from('early_bird_counter').select('paid_count').eq('id', 1).maybeSingle();
    expect(data?.paid_count).not.toBe(999);
  });

  it('the anon key cannot read the private documents bucket', async () => {
    const listed = await anon.storage.from('application-documents').list(applicationId!, { limit: 10 });
    // Either an explicit error, or an empty listing - never a file.
    expect(listed.error ?? listed.data).toBeTruthy();
    if (!listed.error) expect(listed.data ?? []).toHaveLength(0);
  });

  it('the bucket is not public', async () => {
    const { data } = await anon.storage.from('application-documents').getPublicUrl('anything.pdf');
    const response = await fetch(data.publicUrl);
    // A private bucket must not serve an object without a signature.
    expect(response.ok).toBe(false);
  });

  it('the reference number was generated by the database in the documented format', async () => {
    const { data } = await service
      .from('applications')
      .select('reference_number')
      .eq('id', applicationId!)
      .maybeSingle();
    expect(data?.reference_number).toMatch(/^IT-\d{4}-\d{6}$/);
  });

  it('the audit trigger recorded the status change with an actor', async () => {
    // Change the status with the service key, then confirm the trigger wrote a
    // row. auth.uid() is null for a service-key request, so the label falls
    // back to 'system' - which is exactly why staff status changes are made
    // from the admin UI with the user's own token.
    await service.from('applications').update({ status: 'under_review' }).eq('id', applicationId!);

    const { data } = await service
      .from('application_events')
      .select('event_type, from_status, to_status, actor_label')
      .eq('application_id', applicationId!)
      .eq('event_type', 'status_changed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(data?.from_status).toBe('received');
    expect(data?.to_status).toBe('under_review');
    expect(data?.actor_label).toBeTruthy();
  });

  it('a rejected application gets a retention date set by the database', async () => {
    await service.from('applications').update({ status: 'not_successful' }).eq('id', applicationId!);

    const { data } = await service
      .from('applications')
      .select('retention_until')
      .eq('id', applicationId!)
      .maybeSingle();

    expect(data?.retention_until).toBeTruthy();

    const retention = new Date(data!.retention_until as string).getTime();
    const fiveYearsOut = Date.now() + 4.9 * 365 * 24 * 60 * 60 * 1000;
    expect(retention).toBeGreaterThan(fiveYearsOut);
  });
});
