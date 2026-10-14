import '../styles/main.css';
import { initLayout } from '../components/layout';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { APPLICATION_STATUSES, PATHWAY_IDS, type ApplicationStatus, type PathwayId } from '../../shared/types';
import { STATUS_LABELS } from '../../shared/status';
import { fees, earlyBirdSeatsRemaining, formatRand, pathwayName } from '../../shared/courses';
import { formatBytes, formatDateTime, h, qs, render, type Child } from '../lib/dom';

/**
 * The admin area talks to Supabase with the signed-in staff member's own JWT
 * and the anon key, so row level security decides what is visible. It never
 * sees the service key.
 *
 * The three actions that need a secret or elevated rights - decrypting an ID
 * number, issuing a document URL, and erasing an applicant's data - go through
 * the Worker instead.
 *
 * Reading applications here, and changing a status from here, is deliberate:
 * the audit trigger can only record who changed a status if the change really
 * is made as that user, and a request made with the service key has no user.
 */

interface StaffRow {
  user_id: string;
  email: string;
  role: 'staff' | 'admin';
}

interface ApplicationRow {
  id: string;
  reference_number: string;
  status: ApplicationStatus;
  pathway: PathwayId;
  payment_option: string;
  first_name: string;
  surname: string;
  email: string;
  city: string;
  suburb: string;
  created_at: string;
}

const PAGE_SIZE = 25;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;
let staff: StaffRow | null = null;

const filters = {
  status: '' as '' | ApplicationStatus,
  pathway: '' as '' | PathwayId,
  search: '',
  page: 0,
};

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

function notice(kind: 'info' | 'danger' | 'success' | 'accent', ...children: Child[]) {
  return h('div', { class: `notice notice--${kind}` }, ...children);
}

function statusBadge(status: string) {
  const cls =
    status === 'accepted_payment_pending'
      ? 'badge badge--success'
      : status === 'not_successful'
        ? 'badge badge--danger'
        : status === 'waitlisted'
          ? 'badge badge--accent'
          : status === 'under_review'
            ? 'badge badge--brand'
            : 'badge badge--neutral';
  return h('span', { class: cls, text: STATUS_LABELS[status as ApplicationStatus] ?? status });
}

async function accessToken(): Promise<string | null> {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

async function workerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  return fetch(path, { ...init, headers });
}

/* -------------------------------------------------------------------------- */
/* Screens                                                                     */
/* -------------------------------------------------------------------------- */

function renderUnconfigured(): void {
  render(
    '#admin-root',
    notice(
      'danger',
      h('p', { text: 'The admin area is not configured on this deployment.' }),
      h('p', {
        text: 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set when the site is built. Set them in the Cloudflare Pages build environment, then redeploy.',
      }),
    ),
  );
}

function renderSignIn(message?: string): void {
  const email = h('input', { attrs: { type: 'email', id: 'admin-email', autocomplete: 'username', required: true } });
  const password = h('input', { attrs: { type: 'password', id: 'admin-password', autocomplete: 'current-password', required: true } });
  const errorHost = h('div', { class: 'mt-4' });

  const form = h('form', { class: 'form' });
  form.appendChild(h('div', { class: 'field' }, h('label', { attrs: { for: 'admin-email' }, text: 'Staff email' }), email));
  form.appendChild(h('div', { class: 'field' }, h('label', { attrs: { for: 'admin-password' }, text: 'Password' }), password));
  form.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn btn--primary', attrs: { type: 'submit' }, text: 'Sign in' })));
  form.appendChild(errorHost);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!client) return;
    render(errorHost);

    const { error } = await client.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    });

    if (error) {
      render(errorHost, notice('danger', h('p', { text: 'That email address and password combination was not accepted.' })));
      return;
    }
    await boot();
  });

  render(
    '#admin-root',
    message ? notice('info', h('p', { text: message })) : null,
    h('div', { class: 'card' }, h('h2', { text: 'Sign in' }), form),
  );
}

function renderDenied(): void {
  render(
    '#admin-root',
    notice(
      'danger',
      h('p', { text: 'This account does not have staff access to admissions.' }),
      h('p', {
        text: 'Sign in with a staff account, or ask an administrator to add this account to the staff list.',
      }),
    ),
    h(
      'div',
      { class: 'btn-row' },
      h('button', {
        class: 'btn btn--secondary',
        attrs: { type: 'button' },
        text: 'Sign out',
        on: {
          click: async () => {
            await client?.auth.signOut();
            renderSignIn();
          },
        },
      }),
    ),
  );
}

function renderShell(): void {
  const statusSelect = h('select', { attrs: { id: 'filter-status' } });
  statusSelect.appendChild(h('option', { attrs: { value: '' }, text: 'All statuses' }));
  for (const status of APPLICATION_STATUSES) {
    statusSelect.appendChild(
      h('option', { attrs: { value: status, selected: filters.status === status }, text: STATUS_LABELS[status] }),
    );
  }

  const pathwaySelect = h('select', { attrs: { id: 'filter-pathway' } });
  pathwaySelect.appendChild(h('option', { attrs: { value: '' }, text: 'All pathways' }));
  for (const id of PATHWAY_IDS) {
    pathwaySelect.appendChild(
      h('option', { attrs: { value: id, selected: filters.pathway === id }, text: `Pathway ${id.toUpperCase()}` }),
    );
  }

  const search = h('input', {
    attrs: { type: 'search', id: 'filter-search', value: filters.search, placeholder: 'Reference, surname or email' },
  });

  const apply = h('button', {
    class: 'btn btn--secondary',
    attrs: { type: 'button' },
    text: 'Filter',
    on: {
      click: () => {
        filters.status = (statusSelect.value as '' | ApplicationStatus) || '';
        filters.pathway = (pathwaySelect.value as '' | PathwayId) || '';
        filters.search = search.value.trim();
        filters.page = 0;
        void refreshList();
      },
    },
  });

  const signOut = h('button', {
    class: 'btn btn--ghost',
    attrs: { type: 'button' },
    text: 'Sign out',
    on: {
      click: async () => {
        await client?.auth.signOut();
        renderSignIn();
      },
    },
  });

  render(
    '#admin-root',
    h(
      'div',
      {},
      h(
        'p',
        { class: 'muted' },
        `Signed in as ${staff?.email ?? 'staff'} (${staff?.role ?? 'staff'}).`,
      ),
      h('div', { class: 'filters' }, statusSelect, pathwaySelect, search, apply),
      h('div', { attrs: { id: 'admin-list' } }),
      h('div', { class: 'btn-row mt-4' }, signOut),
      h('div', { class: 'mt-6', attrs: { id: 'admin-detail' } }),
    ),
  );

  const counterHost = h('div', { class: 'mt-6', attrs: { id: 'admin-early-bird' } });
  qs('#admin-root')?.appendChild(counterHost);

  void refreshList();
  void renderEarlyBirdWidget();
}

/* -------------------------------------------------------------------------- */
/* List                                                                        */
/* -------------------------------------------------------------------------- */

async function refreshList(): Promise<void> {
  if (!client) return;
  render('#admin-list', h('p', { class: 'muted', text: 'Loading applications…' }));

  let query = client
    .from('applications')
    .select(
      'id, reference_number, status, pathway, payment_option, first_name, surname, email, city, suburb, created_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.pathway) query = query.eq('pathway', filters.pathway);
  if (filters.search) {
    const term = filters.search.replace(/[,()%\\*]/g, ' ').trim();
    if (term) {
      query = query.or(`reference_number.ilike.%${term}%,surname.ilike.%${term}%,email.ilike.%${term}%`);
    }
  }

  const { data, error, count } = await query.range(filters.page * PAGE_SIZE, filters.page * PAGE_SIZE + PAGE_SIZE - 1);

  if (error) {
    render(
      '#admin-list',
      notice('danger', h('p', { text: 'The application list could not be loaded.' }), h('p', { class: 'muted', text: error.message })),
    );
    return;
  }

  const rows = (data ?? []) as ApplicationRow[];
  const total = count ?? rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (rows.length === 0) {
    render('#admin-list', notice('info', h('p', { text: 'No applications match these filters.' })));
    return;
  }

  const table = h(
    'table',
    {},
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { attrs: { scope: 'col' }, text: 'Reference' }),
        h('th', { attrs: { scope: 'col' }, text: 'Applicant' }),
        h('th', { attrs: { scope: 'col' }, text: 'Pathway' }),
        h('th', { attrs: { scope: 'col' }, text: 'Status' }),
        h('th', { attrs: { scope: 'col' }, text: 'Received' }),
        h('th', { attrs: { scope: 'col' }, text: '' }),
      ),
    ),
  );

  const body = h('tbody', {});
  for (const row of rows) {
    body.appendChild(
      h(
        'tr',
        {},
        h('td', { class: 'mono', text: row.reference_number }),
        h('td', {}, `${row.first_name} ${row.surname}`, h('br'), h('span', { class: 'muted', text: row.email })),
        h('td', { text: `Pathway ${row.pathway.toUpperCase()}` }),
        h('td', {}, statusBadge(row.status)),
        h('td', { class: 'nowrap', text: formatDateTime(row.created_at) }),
        h(
          'td',
          {},
          h('button', {
            class: 'btn btn--secondary',
            attrs: { type: 'button' },
            text: 'Open',
            on: { click: () => void openDetail(row.id, row.reference_number) },
          }),
        ),
      ),
    );
  }
  table.appendChild(body);

  render(
    '#admin-list',
    h('p', { class: 'muted', text: `${total} application${total === 1 ? '' : 's'}. Page ${filters.page + 1} of ${pageCount}.` }),
    h('div', { class: 'table-wrap' }, table),
    h(
      'div',
      { class: 'btn-row mt-4' },
      h('button', {
        class: 'btn btn--secondary',
        attrs: { type: 'button', disabled: filters.page === 0 },
        text: 'Previous',
        on: {
          click: () => {
            filters.page = Math.max(0, filters.page - 1);
            void refreshList();
          },
        },
      }),
      h('button', {
        class: 'btn btn--secondary',
        attrs: { type: 'button', disabled: filters.page + 1 >= pageCount },
        text: 'Next',
        on: {
          click: () => {
            filters.page = Math.min(pageCount - 1, filters.page + 1);
            void refreshList();
          },
        },
      }),
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                      */
/* -------------------------------------------------------------------------- */

function detailRow(label: string, value: string | null | undefined) {
  return h('div', {}, h('dt', { text: label }), h('dd', { text: value && value !== '' ? value : '—' }));
}

async function openDetail(id: string, reference: string): Promise<void> {
  if (!client) return;
  const host = '#admin-detail';
  render(host, h('p', { class: 'muted', text: `Loading ${reference}…` }));

  const [application, documents, events, emails] = await Promise.all([
    client.from('applications').select('*').eq('id', id).maybeSingle(),
    client.from('application_documents').select('id, document_type, mime_type, size_bytes, uploaded_at').eq('application_id', id),
    client
      .from('application_events')
      .select('id, event_type, from_status, to_status, actor_label, note, created_at')
      .eq('application_id', id)
      .order('created_at', { ascending: true }),
    client
      .from('outbound_emails')
      .select('id, to_address, template, subject, status, attempts, last_error, created_at, sent_at')
      .eq('application_id', id)
      .order('created_at', { ascending: true }),
  ]);

  if (application.error || !application.data) {
    render(host, notice('danger', h('p', { text: 'That application could not be loaded.' })));
    return;
  }

  const app = application.data as Record<string, unknown>;
  const idNumberCell = h('dd', { text: 'Hidden' });

  const card = h('div', { class: 'card' });

  card.appendChild(h('h2', { text: `${app.reference_number as string} — ${app.first_name as string} ${app.surname as string}` }));
  card.appendChild(statusBadge(app.status as string));

  const details = h(
    'dl',
    { class: 'review-list mt-5' },
    detailRow('Pathway', coursePathwayLabel(app.pathway as string)),
    detailRow('Payment option', String(app.payment_option ?? '')),
    detailRow('Programme', `${String(app.programme_mode ?? '')} from ${String(app.start_date ?? '')}`),
    h('div', {}, h('dt', { text: 'ID or passport number (encrypted)' }), idNumberCell),
    detailRow('Date of birth', String(app.date_of_birth ?? '')),
    detailRow('Email', String(app.email ?? '')),
    detailRow('Mobile', String(app.mobile ?? '')),
    detailRow('City / suburb', `${String(app.city ?? '')} / ${String(app.suburb ?? '')}`),
    detailRow('Highest qualification', String(app.highest_qualification ?? '')),
    detailRow('School', String(app.school_name ?? '')),
    detailRow('Year completed', String(app.year_completed ?? '')),
    detailRow('Matric summary', String(app.matric_results_summary ?? '')),
    detailRow('Guardian', [app.guardian_name, app.guardian_relationship, app.guardian_phone, app.guardian_email].filter(Boolean).join(' · ')),
    detailRow('Consent', consentSummary(app)),
    detailRow('Consent version', String(app.consent_version ?? '')),
    detailRow('Heard about us via', String(app.source ?? '')),
    detailRow('Created', formatDateTime(app.created_at as string)),
    detailRow('Retention until', app.retention_until ? formatDateTime(app.retention_until as string) : 'Not set'),
  );
  card.appendChild(details);

  card.appendChild(
    h(
      'div',
      { class: 'btn-row mt-4' },
      h('button', {
        class: 'btn btn--secondary',
        attrs: { type: 'button' },
        text: 'Reveal ID number',
        on: {
          click: async (event) => {
            const button = event.currentTarget as HTMLButtonElement;
            button.disabled = true;
            const response = await workerFetch(`/api/admin/applications/${id}/id-number`);
            if (!response.ok) {
              idNumberCell.textContent = 'Not available';
              return;
            }
            const payload = (await response.json()) as { idNumber: string | null };
            idNumberCell.textContent = payload.idNumber ?? 'Not supplied';
          },
        },
      }),
    ),
  );

  /* Documents - opened through a short-lived signed URL issued by the Worker. */
  const documentHost = h('div', { class: 'mt-5' });
  const documentRows = (documents.data ?? []) as Array<Record<string, unknown>>;
  documentHost.appendChild(h('h3', { text: 'Documents' }));
  if (documentRows.length === 0) {
    documentHost.appendChild(h('p', { class: 'muted', text: 'No documents were uploaded.' }));
  } else {
    const list = h('ul', { class: 'stack-sm' });
    for (const document of documentRows) {
      const line = h('li', {});
      const openButton = h('button', {
        class: 'btn btn--secondary',
        attrs: { type: 'button' },
        text: `Open ${String(document.document_type).replace(/_/g, ' ')}`,
      });
      openButton.addEventListener('click', async () => {
        openButton.disabled = true;
        const response = await workerFetch(`/api/admin/documents/${document.id}/signed-url`, { method: 'POST' });
        openButton.disabled = false;
        if (!response.ok) {
          line.appendChild(h('p', { class: 'field__error', text: 'That document could not be opened.' }));
          return;
        }
        const payload = (await response.json()) as { url: string };
        window.open(payload.url, '_blank', 'noopener');
      });
      line.appendChild(openButton);
      line.appendChild(
        h('span', { class: 'muted', text: ` ${formatBytes(Number(document.size_bytes ?? 0))}, uploaded ${formatDateTime(String(document.uploaded_at ?? ''))}` }),
      );
      list.appendChild(line);
    }
    documentHost.appendChild(list);
    documentHost.appendChild(
      h('p', { class: 'muted', text: 'Links expire after a few minutes. Documents are never served as public URLs.' }),
    );
  }
  card.appendChild(documentHost);

  /* Status change - performed as the signed-in staff member so the audit trail
     records who did it. */
  const statusSelect = h('select', { attrs: { id: 'detail-status' } });
  for (const status of APPLICATION_STATUSES) {
    statusSelect.appendChild(
      h('option', { attrs: { value: status, selected: app.status === status }, text: STATUS_LABELS[status] }),
    );
  }
  const statusNote = h('textarea', { attrs: { id: 'detail-status-note', rows: 2, placeholder: 'Optional note for the audit trail' } });
  const statusFeedback = h('div', { class: 'mt-4' });
  const saveStatus = h('button', {
    class: 'btn btn--primary',
    attrs: { type: 'button' },
    text: 'Save status',
  });
  saveStatus.addEventListener('click', async () => {
    saveStatus.disabled = true;
    render(statusFeedback);
    const nextStatus = statusSelect.value as ApplicationStatus;
    const { error } = await client!
      .from('applications')
      .update({ status: nextStatus })
      .eq('id', id);
    saveStatus.disabled = false;
    if (error) {
      render(statusFeedback, notice('danger', h('p', { text: 'The status could not be saved.' }), h('p', { class: 'muted', text: error.message })));
      return;
    }
    const note = statusNote.value.trim();
    if (note) {
      await client!.from('application_events').insert({
        application_id: id,
        event_type: 'note_added',
        note,
        actor_id: (await client!.auth.getUser()).data.user?.id ?? null,
      });
      statusNote.value = '';
    }
    render(statusFeedback, notice('success', h('p', { text: `Status saved as ${STATUS_LABELS[nextStatus]}.` })));
    await refreshList();
    void openDetail(id, reference);
  });

  card.appendChild(
    h(
      'div',
      { class: 'mt-6' },
      h('h3', { text: 'Change status' }),
      h('div', { class: 'field' }, h('label', { attrs: { for: 'detail-status' }, text: 'New status' }), statusSelect),
      h('div', { class: 'field' }, h('label', { attrs: { for: 'detail-status-note' }, text: 'Internal note' }), statusNote),
      h('div', { class: 'btn-row' }, saveStatus),
      statusFeedback,
    ),
  );

  /* Audit trail */
  const eventRows = (events.data ?? []) as Array<Record<string, unknown>>;
  const timeline = h('ul', { class: 'timeline mt-4' });
  if (eventRows.length === 0) {
    timeline.appendChild(h('li', { class: 'muted', text: 'No events recorded.' }));
  } else {
    for (const event of eventRows) {
      timeline.appendChild(
        h(
          'li',
          {},
          h('time', { text: formatDateTime(String(event.created_at ?? '')) }),
          h('strong', { text: String(event.event_type) }),
          event.from_status || event.to_status
            ? h('span', { class: 'muted', text: ` · ${String(event.from_status ?? '—')} → ${String(event.to_status ?? '—')}` })
            : null,
          h('span', { class: 'muted', text: ` · by ${String(event.actor_label ?? 'system')}` }),
          event.note ? h('p', { text: String(event.note) }) : null,
        ),
      );
    }
  }
  card.appendChild(h('div', { class: 'mt-6' }, h('h3', { text: 'Audit trail' }), timeline));

  /* Queued email */
  const emailRows = (emails.data ?? []) as Array<Record<string, unknown>>;
  const emailHost = h('div', { class: 'mt-6' }, h('h3', { text: 'Confirmation email' }));
  if (emailRows.length === 0) {
    emailHost.appendChild(h('p', { class: 'muted', text: 'No email was queued for this application.' }));
  } else {
    for (const email of emailRows) {
      emailHost.appendChild(
        notice(
          email.status === 'failed' ? 'danger' : 'success',
          h('p', { text: `${String(email.template)} — ${String(email.status)}` }),
          h('p', { class: 'muted', text: `Attempts: ${String(email.attempts ?? 0)}. ${email.sent_at ? `Sent ${formatDateTime(String(email.sent_at))}` : 'Not sent yet.'}` }),
          email.last_error ? h('p', { class: 'mono', text: String(email.last_error) }) : null,
          email.status === 'failed'
            ? h('p', { text: 'The application is saved. The confirmation email can be re-sent once the email provider is configured.' })
            : null,
        ),
      );
    }
  }
  card.appendChild(emailHost);

  /* POPIA deletion - administrators only, and it goes through the Worker. */
  if (staff?.role === 'admin') {
    const reason = h('textarea', { attrs: { id: 'delete-reason', rows: 2, placeholder: 'Reason for the deletion request' } });
    const confirm = h('input', { attrs: { type: 'text', id: 'delete-confirm', placeholder: 'Type DELETE' } });
    const feedback = h('div', { class: 'mt-4' });
    const deleteButton = h('button', {
      class: 'btn btn--danger',
      attrs: { type: 'button' },
      text: 'Erase this applicant’s data',
    });
    deleteButton.addEventListener('click', async () => {
      deleteButton.disabled = true;
      render(feedback);
      const response = await workerFetch(`/api/admin/applications/${id}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: confirm.value.trim(), reason: reason.value.trim() }),
      });
      deleteButton.disabled = false;
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        render(feedback, notice('danger', h('p', { text: payload.error?.message ?? 'The data could not be erased.' })));
        return;
      }
      render(feedback, notice('success', h('p', { text: 'The applicant’s data has been erased and the deletion was logged.' })));
      render('#admin-detail');
      await refreshList();
    });

    card.appendChild(
      h(
        'div',
        { class: 'mt-6' },
        h('h3', { text: 'Delete on request (POPIA)' }),
        h('p', {
          text: 'Removes the application, its documents and its queued email, and records that the deletion happened. This cannot be undone.',
        }),
        h('div', { class: 'field' }, h('label', { attrs: { for: 'delete-reason' }, text: 'Reason' }), reason),
        h('div', { class: 'field' }, h('label', { attrs: { for: 'delete-confirm' }, text: 'Confirmation' }), confirm),
        h('div', { class: 'btn-row' }, deleteButton),
        feedback,
      ),
    );
  }

  render(host, card);
}

function consentSummary(app: Record<string, unknown>): string {
  const parts = [
    app.information_true_at ? 'information confirmed' : null,
    app.popia_consent_at ? 'POPIA consent' : null,
    app.marketing_consent ? 'marketing opted in' : 'no marketing consent',
    app.terms_accepted_at ? 'terms accepted' : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function coursePathwayLabel(pathway: string): string {
  return `Pathway ${pathway.toUpperCase()}: ${pathwayName(pathway)}`;
}

/* -------------------------------------------------------------------------- */
/* Early-bird counter                                                          */
/* -------------------------------------------------------------------------- */

async function renderEarlyBirdWidget(): Promise<void> {
  if (!client) return;
  const { data, error } = await client.from('early_bird_counter').select('paid_count, updated_at').eq('id', 1).maybeSingle();

  if (error) {
    render('#admin-early-bird', notice('danger', h('p', { text: 'The early-bird counter could not be read.' })));
    return;
  }

  const paid = Number(data?.paid_count ?? 0);
  const input = h('input', { attrs: { type: 'number', id: 'early-bird-count', min: 0, value: paid } });
  const feedback = h('div', { class: 'mt-4' });
  const save = h('button', { class: 'btn btn--primary', attrs: { type: 'button' }, text: 'Save count' });

  save.addEventListener('click', async () => {
    save.disabled = true;
    render(feedback);
    const next = Math.max(0, Math.trunc(Number(input.value) || 0));
    const { error: updateError } = await client!.from('early_bird_counter').update({ paid_count: next }).eq('id', 1);
    save.disabled = false;
    if (updateError) {
      render(feedback, notice('danger', h('p', { text: 'The count could not be saved. Only an administrator can change it.' })));
      return;
    }
    render(feedback, notice('success', h('p', { text: 'Count saved.' })));
    await renderEarlyBirdWidget();
  });

  render(
    '#admin-early-bird',
    h(
      'div',
      { class: 'card' },
      h('h3', { text: 'Early-bird places' }),
      h('p', {
        text: `The early-bird fee applies to the first ${fees.earlyBird.seats} paid learners and closes ${fees.earlyBird.closesLabel}, at ${formatRand(fees.earlyBird.amount)}.`,
      }),
      h('p', { text: `Currently ${paid} paid, so ${earlyBirdSeatsRemaining(paid)} places remain.` }),
      h('div', { class: 'field' }, h('label', { attrs: { for: 'early-bird-count' }, text: 'Paid learners' }), input),
      h('div', { class: 'btn-row' }, save),
      feedback,
      staff?.role !== 'admin'
        ? h('p', { class: 'muted', text: 'Only an administrator can change this number.' })
        : null,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

async function boot(): Promise<void> {
  if (!client) {
    renderUnconfigured();
    return;
  }

  const { data: sessionData } = await client.auth.getSession();
  const user = sessionData.session?.user;

  if (!user) {
    renderSignIn();
    return;
  }

  const { data: staffRow, error: staffError } = await client
    .from('staff_users')
    .select('user_id, email, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (staffError || !staffRow) {
    staff = null;
    renderDenied();
    return;
  }

  staff = staffRow as StaffRow;
  renderShell();
}

function main(): void {
  initLayout();

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    renderUnconfigured();
    return;
  }

  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  void boot();
}

void main();
