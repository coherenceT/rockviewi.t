import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * End to end submission: fills the real form in a real browser, submits to the
 * Worker, and then checks the four things the brief asks for - the database
 * row, the uploaded documents, the audit event and the outbound email row.
 *
 * Requirements (all must be set, or the suite is skipped):
 *
 *   E2E_SUPABASE_URL            Supabase project URL
 *   E2E_SUPABASE_ANON_KEY       anon key (used only to build the site)
 *   E2E_SUPABASE_SERVICE_KEY    service key (used for the assertions)
 *   E2E_BUILD_WITH_SUPABASE=1   build the admin bundle too
 *
 * The Worker must run with ENVIRONMENT=development and no TURNSTILE_SECRET, and
 * EMAIL_PROVIDER=dev, so that bot protection is skipped and the development
 * email adapter marks the message as sent. See the README for the command.
 *
 * Skipped rather than faked when the project is not configured: a passing test
 * that never touched a database would be worse than no test.
 */

const PROJECT_URL = process.env.E2E_SUPABASE_URL;
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const configured = Boolean(PROJECT_URL && SERVICE_KEY);

const suite = configured ? test.describe : test.describe.skip;

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex',
);

const RUN_ID = Date.now();

suite('full application submission', () => {
  let service: SupabaseClient;
  let reference: string | null = null;

  test.beforeAll(() => {
    service = createClient(PROJECT_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
  });

  test.afterAll(async () => {
    if (!reference) return;
    const { data } = await service.from('applications').select('id').eq('reference_number', reference).maybeSingle();
    if (!data) return;

    const { data: documents } = await service
      .from('application_documents')
      .select('storage_path')
      .eq('application_id', data.id);

    const paths = (documents ?? []).map((row) => row.storage_path as string);
    if (paths.length > 0) await service.storage.from('application-documents').remove(paths);
    await service.from('applications').delete().eq('id', data.id);
    await service.storage.from('application-documents').remove([`${data.id}/`]);
  });

  test('submits, stores, audits and queues the confirmation email', async ({ page }) => {
    const email = `e2e-${RUN_ID}@example.invalid`;

    await page.goto('/apply/');

    /* Step 1 - personal details */
    await page.getByLabel('First name').fill('Thandi');
    await page.getByLabel('Surname').fill('Mkhize');
    await page.getByLabel('Date of birth').fill('2005-03-14');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Mobile number').fill('0821234567');
    await page.getByLabel('City or town').fill('Pietermaritzburg');
    await page.getByLabel('Suburb').fill('Northdale');
    await page.getByTestId('next-step').click();

    /* Step 2 - education */
    await page.getByLabel('Highest qualification completed').fill('National Senior Certificate');
    await page.getByLabel('School or institution').fill('Northdale Secondary School');
    await page.getByLabel('Year completed').fill('2023');
    await page.getByTestId('next-step').click();

    /* Step 3 - programme choice */
    await page.getByLabel('Which pathway?').selectOption('b');
    await page.getByLabel('Preferred payment option').selectOption('monthly');
    await page.getByLabel('How did you hear about the school?').fill('A friend at school');
    await page.getByTestId('next-step').click();

    /* Step 5 - documents */
    await page.getByLabel('Certified copy of your ID or passport').setInputFiles({
      name: 'certified-id.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    });
    await page.getByLabel('Certified copy of your highest qualification').setInputFiles({
      name: 'matric.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await page.getByTestId('next-step').click();

    /* Step 6 - consent */
    await page.getByLabel('I confirm that the information in this application is true and complete.').check();
    await page.getByLabel(/I consent to my information being processed for admissions/).check();
    await page.getByLabel(/I agree to the terms of enrolment/).check();
    await page.getByTestId('next-step').click();

    /* Step 7 - review and submit */
    await expect(page.locator('#apply-fields h2')).toHaveText('Review your application');
    await page.getByTestId('submit-application').click();

    await page.waitForURL(/\/apply\/thank-you\/IT-\d{4}-\d{6}$/, { timeout: 30_000 });
    reference = decodeURIComponent(new URL(page.url()).pathname.split('/').filter(Boolean).pop()!);
    expect(reference).toMatch(/^IT-\d{4}-\d{6}$/);

    // The confirmation page must not imply acceptance.
    await expect(page.locator('#thank-you')).toContainText('does not confirm a place');

    /* The database row */
    const { data: application, error } = await service
      .from('applications')
      .select('*')
      .eq('reference_number', reference)
      .maybeSingle();

    expect(error).toBeNull();
    expect(application).not.toBeNull();
    expect(application!.email).toBe(email);
    expect(application!.pathway).toBe('b');
    expect(application!.status).toBe('received');
    expect(application!.popia_consent_at).toBeTruthy();
    expect(application!.terms_accepted_at).toBeTruthy();
    expect(application!.information_true_at).toBeTruthy();
    expect(application!.marketing_consent).toBe(false);

    /* The uploaded documents */
    const { data: documents } = await service
      .from('application_documents')
      .select('document_type, storage_path, mime_type, size_bytes')
      .eq('application_id', application!.id);

    expect(documents).toHaveLength(2);
    const types = (documents ?? []).map((row) => row.document_type).sort();
    expect(types).toEqual(['certified_id', 'highest_qualification']);

    for (const document of documents ?? []) {
      expect(document.storage_path).toMatch(
        new RegExp(`^${application!.id}/${document.document_type}/[0-9a-f-]{36}\\.(pdf|jpg|png)$`),
      );
      // Downloading through the service key proves the object really is stored.
      const { data: file, error: downloadError } = await service.storage
        .from('application-documents')
        .download(document.storage_path as string);
      expect(downloadError).toBeNull();
      expect(file).not.toBeNull();
    }

    /* The audit trail */
    const { data: events } = await service
      .from('application_events')
      .select('event_type')
      .eq('application_id', application!.id);

    const eventTypes = (events ?? []).map((row) => row.event_type);
    expect(eventTypes).toContain('submitted');
    expect(eventTypes).toContain('email_queued');
    expect(eventTypes).toContain('email_sent');

    /* The queued confirmation email */
    const { data: emails } = await service
      .from('outbound_emails')
      .select('to_address, template, subject, status, sent_at')
      .eq('application_id', application!.id);

    expect(emails).toHaveLength(1);
    expect(emails![0]!.to_address).toBe(email);
    expect(emails![0]!.template).toBe('application_received');
    expect(emails![0]!.subject).toContain(reference);
    expect(emails![0]!.status).toBe('sent');
    expect(emails![0]!.sent_at).toBeTruthy();
  });

  test('the status page returns the new status to the applicant', async ({ page, request }) => {
    test.skip(!reference, 'the submission test did not produce a reference');

    const response = await request.post('http://127.0.0.1:8788/api/status', {
      data: { referenceNumber: reference, email: `e2e-${RUN_ID}@example.invalid` },
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as { status: string; label: string };
    expect(body.status).toBe('received');
    expect(body.label).toBe('Received');

    // A wrong email address must not reveal anything.
    const wrong = await request.post('http://127.0.0.1:8788/api/status', {
      data: { referenceNumber: reference, email: 'someone-else@example.invalid' },
    });
    expect(wrong.status()).toBe(404);

    await page.goto('/status');
    await page.getByLabel('Reference number').fill(reference!);
    await page.getByLabel('Email address').fill(`e2e-${RUN_ID}@example.invalid`);
    await page.getByRole('button', { name: 'Check status' }).click();
    await expect(page.locator('#status-result')).toContainText('Received');
  });

  test('rejects a disallowed file type at the client and at the server', async ({ page, request }) => {
    /* Server side: a PDF is fine, an executable is not, whatever the client says. */
    const payload = JSON.stringify({
      firstName: 'Bot',
      surname: 'Attempt',
      dateOfBirth: '2005-03-14',
      email: `bot-${RUN_ID}@example.invalid`,
      mobile: '0821234567',
      city: 'Pietermaritzburg',
      suburb: 'Northdale',
      highestQualification: 'National Senior Certificate',
      schoolName: 'Fixture',
      yearCompleted: 2023,
      programmeMode: 'full_time',
      pathway: 'a',
      startDate: '2027-02-01',
      paymentOption: 'monthly',
      source: 'test',
      informationTrue: true,
      popiaConsent: true,
      termsAccepted: true,
    });

    const response = await request.post('http://127.0.0.1:8788/api/applications', {
      multipart: {
        payload,
        certified_id: {
          name: 'virus.exe',
          mimeType: 'application/x-msdownload',
          buffer: Buffer.from('MZ'),
        },
        highest_qualification: {
          name: 'matric.pdf',
          mimeType: 'application/pdf',
          buffer: PDF,
        },
      },
    });

    expect(response.status()).toBe(422);
    const body = (await response.json()) as { error: { fields: Array<{ field: string }> } };
    expect(body.error.fields.some((field) => field.field === 'certified_id')).toBe(true);

    // Nothing partial may have been written for the rejected attempt.
    const { data } = await service
      .from('applications')
      .select('id')
      .eq('email', `bot-${RUN_ID}@example.invalid`);
    expect(data ?? []).toHaveLength(0);

    /* Client side: the same file is rejected before it is ever uploaded. */
    await page.goto('/apply/');
    await page.getByLabel('First name').fill('Thandi');
    await page.getByLabel('Surname').fill('Mkhize');
    await page.getByLabel('Date of birth').fill('2005-03-14');
    await page.getByLabel('Email address').fill(`client-${RUN_ID}@example.invalid`);
    await page.getByLabel('Mobile number').fill('0821234567');
    await page.getByLabel('City or town').fill('Pietermaritzburg');
    await page.getByLabel('Suburb').fill('Northdale');
    await page.getByTestId('next-step').click();
    await page.getByLabel('Highest qualification completed').fill('National Senior Certificate');
    await page.getByLabel('School or institution').fill('Fixture');
    await page.getByLabel('Year completed').fill('2023');
    await page.getByTestId('next-step').click();
    await page.getByLabel('Which pathway?').selectOption('a');
    await page.getByLabel('Preferred payment option').selectOption('monthly');
    await page.getByLabel('How did you hear about the school?').fill('test');
    await page.getByTestId('next-step').click();

    await page.getByLabel('Certified copy of your ID or passport').setInputFiles({
      name: 'virus.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('MZ'),
    });

    await expect(page.locator('.field__error')).toContainText('PDF, JPG or PNG');
  });
});
