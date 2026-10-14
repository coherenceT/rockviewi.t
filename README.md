# IT Career Foundation School — admissions site

A small, fast, mobile-first admissions site for a full-time IT skills school in
Northdale, Pietermaritzburg, with a real application pipeline behind it:
a validated multi-step form, document upload, an automatic confirmation email,
a reference-number status lookup, and a staff admin area.

> **School name is a placeholder.** `IT Career Foundation School` appears in one
> file — [`shared/config.ts`](shared/config.ts) — and is used everywhere else.
> Change it there and the whole site follows.

---

## 1. Where the project stands

**Built and verified locally**

| Piece | State |
| --- | --- |
| Landing page, with pathway cards, fee table, countdown and FAQ | Done |
| Course pages `/courses/a`, `/courses/b`, `/courses/c` | Done |
| Seven-step application form with local draft and client-side file checks | Done |
| `POST /api/applications` — Turnstile, Zod validation, rate limit, rollback, audit, email | Done |
| Confirmation email, plain text and HTML, behind a provider adapter | Done (development adapter) |
| Thank-you page `/apply/thank-you/:ref` and status lookup `/status` | Done |
| Admin area with Supabase Auth and staff-role restriction | Done |
| Supabase migrations: schema, RLS, private storage bucket, retention | Done |
| Unit tests, RLS proofs, browser smoke tests | Done |
| README, security headers, `.env.example` | Done |

**Not done, and deliberately so** — every one needs something from the school
(see [§14](#14-what-i-need-from-you)):

- The Knock adapter is **written but not switched on**: no key is set, so the
  module still uses the **development adapter** that logs instead of sending.
  Wiring it up takes two values and a dashboard template (§13.6).
- Turnstile is **not enabled**: no site key or secret yet. The code path is
  written and fails closed in production.
- No Supabase project, no Cloudflare project, no domain. Local development
  uses `wrangler pages dev`; nothing has been deployed.
- Pathway module descriptions, the laptop requirement, accreditation and NQF
  wording, the privacy notice, the terms and the retention period all render as
  visible placeholders rather than invented copy.

---

## 2. Stack

| Layer | Choice |
| --- | --- |
| Frontend | Static multi-page site built with Vite 5 and vanilla TypeScript (no UI framework) |
| Hosting | Cloudflare Pages, connected to GitHub |
| Server side | Cloudflare Pages Functions (`functions/`) |
| Validation | Zod 3, one schema shared by browser and Worker ([`shared/validation.ts`](shared/validation.ts)) |
| Database | Supabase Postgres, migrations in [`supabase/migrations/`](supabase/migrations) |
| Storage | Supabase Storage, private bucket `application-documents` |
| Auth (staff) | Supabase Auth + a `staff_users` allow-list |
| Rate limiting | Cloudflare KV counter (5 submissions per IP per hour) |
| Bot protection | Cloudflare Turnstile (written, not yet enabled) |
| Email | Provider adapter; development adapter shipped |

### How a request flows

```
browser ──POST /api/applications──▶ Pages Function
                                     ├─ same-origin check
                                     ├─ rate limit peek            (KV)
                                     ├─ Zod validation             (shared schema)
                                     ├─ Turnstile verify           (when configured)
                                     ├─ rate limit consume         (KV)
                                     ├─ INSERT application         (service key)
                                     ├─ upload documents           (private bucket)
                                     ├─ INSERT application_events  ('submitted')
                                     ├─ INSERT outbound_emails     ('queued')
                                     └─ sendEmail() ×3 with backoff
                                          └─ mark sent / failed
```

The browser **never** holds the Supabase service key. Public visitors reach the
database only through this endpoint.

---

## 3. Local setup

Requires Node 20+. Verified on Node 25.

```bash
npm install
cp .env.example .dev.vars     # fill in as you go; .dev.vars is git-ignored
```

### Run the static site

```bash
npm run dev            # Vite dev server, http://localhost:5173
```

This gives you the pages with hot reload. The `/api/*` routes are **not** served
by Vite, so anything that talks to the API (submitting, the live early-bird
counter) will show its graceful "unavailable" state.

### Run the real thing, including the API

```bash
npm run build
npm run dev:pages      # wrangler pages dev dist, http://127.0.0.1:8788
```

`npm run dev:pages` runs your Pages Functions in workerd, with a simulated KV
namespace, exactly like production. This is the mode the browser tests use.

### Database (local)

```bash
npx supabase init                  # creates supabase/config.toml, keeps migrations/
npx supabase start                 # local Postgres, Auth, Storage
npx supabase db reset              # applies every migration in order
```

`supabase db reset` writes the connection details into `.dev.vars` style output;
copy `API URL` and the `anon key` / `service_role key` into `.dev.vars`.

---

## 4. Configuration

Two files hold everything the school will want to change.

**`shared/config.ts`** — brand and content
- School name (currently `IT Career Foundation School`), tagline, contact details, location, domain
- Intake dates, month count, weekly schedule, maximum class size
- Legal placeholders: accreditation, NQF/qualification status, privacy and terms status, consent version, retention period

**`shared/courses.json`** — every price and every module
- Fees: monthly, registration, standard total, upfront, early bird, sponsor a seat
- The shared morning core and all three pathways, with module titles
- `salaryRangesApprovedForDisplay` — **false**, so no salary range is published yet
- `fees.vat.statusConfirmed` — **false**, so displayed fees carry `[VAT treatment: TO BE CONFIRMED]` instead of a claim
- `fees.earlyBird.amountBasisConfirmed` — **false**, to be confirmed as a total or a monthly amount

The countdown is driven by `fees.earlyBird.closesAt`, so moving the campaign date
moves the countdown.

### Why `courses.json` and not `courses` / `fees` tables

The brief asked me to choose and explain. I put the course and price data in
`courses.json` rather than in Postgres, because:

- **Nothing about it is per-user or dynamic.** There is no need for a query, a
  join or a policy; a static import is faster and cannot fail.
- **It keeps the public site readable by anyone.** Fee data in Postgres would
  need either a public read policy (widening the anon surface) or a Worker
  endpoint plus a database round trip on every page view. The footer and fee
  table would then break whenever the database was slow.
- **It is cacheable and auditable.** Prices ship with the build, so the
  deployed artefact and the price list are the same thing, and a change is a
  reviewable diff rather than a dashboard edit.
- **The one genuinely dynamic number is already a table.**
  `early_bird_counter` is in Postgres because it is updated by staff, and the
  landing page reads it through `GET /api/early-bird`.

If the school later wants non-technical staff editing prices, the migration path
is to add `courses`/`fees` tables and have a build step generate `courses.json`
from them — the rendering code would not change. Say the word and I will do it.

---

## 5. Database

Migrations live in [`supabase/migrations/`](supabase/migrations) and are applied
in filename order. Nothing is ever edited in the dashboard.

| File | Contents |
| --- | --- |
| `0001_schema.sql` | Enums, tables, reference-number sequence, triggers, grants |
| `0002_rls.sql` | Row level security policies for every table |
| `0003_storage.sql` | Private bucket, size and MIME limits, staff read policy |

### Tables

| Table | Purpose |
| --- | --- |
| `applications` | One row per application. `reference_number` is unique and generated by the database. |
| `application_documents` | One row per uploaded file; the object itself lives in Storage. |
| `application_events` | Append-only audit trail: submissions, status changes, notes, emails. |
| `outbound_emails` | Every queued confirmation email and its delivery state. |
| `early_bird_counter` | A single row holding how many early-bird places have been paid for. |
| `staff_users` | The staff allow-list. A row here is what makes an account a staff account. |
| `data_deletion_log` | Proof that a POPIA deletion was actioned, without the deleted data. |

### Reference numbers

Format `IT-<intake year>-<6 digit sequence>`, e.g. `IT-2027-000123`.

The value is assigned by a `BEFORE INSERT` trigger calling
`generate_reference_number()`, which draws from the sequence
`application_reference_seq`. The format is defined in two places on purpose —
the SQL trigger and [`shared/reference.ts`](shared/reference.ts) — and a unit
test asserts the TypeScript side matches the published pattern.

### Row level security

RLS is enabled on every table. The important properties:

- **There is no INSERT policy for `anon` anywhere.** A public visitor cannot
  write to `applications` directly, by construction. Submissions only happen
  through the Worker with the service key.
- **Staff read through RLS.** `authenticated` may read applications only if
  `is_staff()` is true for their `auth.uid()`. `anon` is explicitly `REVOKE`d
  instead of relying on Supabase defaults, so an unauthorised read is a
  permission error rather than an empty result.
- **No DELETE policy is granted to `authenticated`.** Deletion goes through the
  audited Worker endpoint.
- **The documents bucket has no public read path.** Only a staff SELECT policy
  exists; uploads and removals are done server-side.

`tests/rls/rls.test.ts` proves all of this against a real project, including
that the anon key cannot read applications, documents, events, emails, the staff
list or the counter, cannot insert an application, cannot change a status, and
cannot fetch a document from the private bucket.

### Status changes are audited

`applications_after_update` writes an `application_events` row on every status
change, recording the actor and the time. This is why staff status changes are
made from the admin UI using the staff member's **own** Supabase JWT rather than
through a Worker route: a request made with the service key has no user attached,
so `auth.uid()` would be null and the audit trail would say "system" for
something a person did.

### Retention

When an application becomes `not_successful`, a trigger sets
`retention_until = now() + interval '5 years'`. That interval is written in
`applications_before_insert` / `applications_before_update` in `0001_schema.sql`
and is deliberately not a setting: changing the retention policy should be a
reviewable migration. **Confirm the five-year default before launch.**

There is no automatic purge job. Wiring one up (a Supabase scheduled function or
a Cloudflare cron Worker) is a follow-up, not part of this build.

---

## 6. Sensitive data at rest

The ID or passport number is the only field that needs protecting beyond
transport and volume encryption.

- The Worker encrypts it with **AES-256-GCM** before the insert. The key
  (`FIELD_ENCRYPTION_KEY`, 32 bytes base64) lives in **Cloudflare only** — it is
  never given to Supabase.
- `applications.id_number` therefore holds base64 ciphertext, not a plaintext ID.
- A separate `id_number_hash` column holds a SHA-256 of the normalised value, so
  duplicates can be spotted without decrypting anything.
- Each encryption uses a fresh random IV, so the same ID number produces
  different ciphertext every time.
- **What this protects:** a database dump, a Supabase backup, a leaked dashboard
  session or a compromised Supabase credential — the key is not in Supabase.
- **What it does not protect:** a compromised Worker or a leaked
  `FIELD_ENCRYPTION_KEY`. There is no automatic key rotation; rotating the key
  means re-encrypting the `id_number` column (the hash column is unaffected).
- If `FIELD_ENCRYPTION_KEY` is missing and an applicant supplied an ID number,
  the submission is **refused** rather than stored in plaintext. The unit tests
  assert both halves of that behaviour.

Generate a key with:

```bash
openssl rand -base64 32
```

Other checks: documents are validated on MIME type, extension and size on both
the client and the server; every query is parameterised through `supabase-js`;
and Worker logs are structurally incapable of carrying personal data (see §8).

---

## 7. The submission flow

`POST /api/applications`, in [`functions/api/applications.ts`](functions/api/applications.ts).

1. **Same-origin check** — a foreign `Origin` gets a 403.
2. **Rate limit peek** — 5 per IP per hour via KV. A peek does not spend quota,
   so an applicant fixing a typo is not locked out.
3. **Parse and validate** — the multipart payload plus every file, using the
   same Zod schema the browser used. Field errors come back per field so the
   form can highlight them.
4. **Turnstile** — verified when a secret is configured. In production a missing
   secret **fails closed** (503) rather than silently running unprotected. In
   development and preview it is skipped with a warning.
5. **Rate limit consume** — only a valid submission spends quota.
6. **Persist, then upload** — insert the application, upload each document to
   `{application_id}/{document_type}/{uuid}.{ext}`, insert the document rows,
   then the `submitted` event.
7. **Roll back on failure** — if anything in step 6 throws, uploaded objects are
   deleted and the application row is deleted (cascading to its documents,
   events and queued email). A partial application cannot survive.
8. **Queue and send the email** — insert an `outbound_emails` row, then send
   through `sendEmail()` with **3 attempts** and a 250 ms / 750 ms backoff.
9. **Email failure does not lose the application.** The row is marked `failed`
   with a scrubbed error message and an `email_failed` event, the application
   stays saved, and the admin area shows the failure.
10. **Respond** with the reference number, and the browser redirects to
    `/apply/thank-you/:ref`.

The retries are inline, which is right for a provider that is up but flaky. For
durable retries across a provider outage, move step 8 onto Cloudflare Queues or
a cron trigger — the `outbound_emails` table is already shaped for it.

### The confirmation email

`shared/emailTemplates.ts` holds the wording, in both HTML and plain text.

- Subject: `We have received your application - IT-2027-000123`
- The reference number, the pathway applied for, and the fact that the
  application is under review
- **It never says the applicant has been accepted or holds a place.** The
  disclaimer is fixed text: receiving the email does not confirm a place; a place
  is confirmed only after the admissions decision and the payment steps.
- Links to the status page and the privacy notice, plus the contact address
- An opt-out line that only claims an opt-in when marketing consent was given;
  otherwise it states the message is transactional

A unit test asserts the absence of "congratulations", "you have been accepted",
"guaranteed job", "accredited" and "NQF" from the rendered email, in both formats.

---

## 8. Logging

`worker/lib/logger.ts` enforces the "no personal data in logs" rule in code
rather than by convention. Every call site declares named fields, and the logger
**drops the value of any field whose name looks like personal data** —
`email`, `mobile`, `name`, `id_number`, `guardian`, `note`, `token`, … — writing
`[redacted]` in its place. Unknown field names keep the name and drop the value.

Client IP addresses are hashed (`hashForLog`) before they are used as
rate-limit bucket keys, so the counter is not a log of who visited.

The development email adapter does not print the recipient or the body by
default; `EMAIL_DEV_LOG_BODY=true` prints the body during local work and is
refused in production.

---

## 9. Admin area

`/admin`, in [`src/pages/admin.ts`](src/pages/admin.ts).

- **Sign in** with Supabase Auth (email and password). The anon key is used;
  never the service key.
- **Authorisation is a separate check from authentication.** A valid session
  still gets "no staff access" unless there is a row in `staff_users` — even
  though a user can only read their own row there.
- **List and filter** applications by status, pathway and free text (reference,
  surname or email), 25 to a page.
- **Detail view** with all submitted fields, the audit timeline, the queued
  email and its delivery state.
- **Documents** open through a short-lived signed URL (5 minutes, maximum 15)
  issued by the Worker. The bucket stays private; there is no permanent link.
- **Change status** — written as the signed-in staff member, so the trigger
  records who did it. An optional note is saved alongside.
- **Reveal the ID number** decrypts it server-side, for staff only, on demand.
- **Erase an applicant's data (POPIA)** — administrators only, requires typing
  `DELETE`. Removes the storage objects and the row (cascading to everything),
  then writes an audited entry to `data_deletion_log` that keeps the reference
  number and who actioned it, not the erased data.
- **Early-bird counter** — set how many places have been paid for. Only an
  administrator can change it (enforced by RLS, not just by the UI).

Add staff with SQL after creating the user in Supabase Auth:

```sql
insert into public.staff_users (user_id, email, role)
select id, email, 'admin'
from auth.users
where lower(email) = lower('principal@example.com')
on conflict (user_id) do update
  set role = excluded.role, email = excluded.email;
```

Use `'staff'` instead of `'admin'` for someone who may review but not erase data.

---

## 10. Security headers

Set in two places, and a unit test asserts the two stay identical:

- `public/_headers` — every static asset, applied by Cloudflare's edge without
  invoking a Function
- `SECURITY_HEADERS` in [`worker/lib/http.ts`](worker/lib/http.ts) — every API
  response, via `functions/api/_middleware.ts`

`Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and a
`Content-Security-Policy` that forbids inline scripts, `eval`, framing and
`object`/`base` injection. `connect-src` is limited to the site itself, Supabase
and Turnstile. API responses are `no-store`.

---

## 11. Tests

```bash
npm run typecheck      # tsc --noEmit
npm test               # unit tests (Vitest)
npm run test:e2e       # browser smoke tests (Playwright, mobile emulation)
npm run vitals         # Core Web Vitals measurement
```

### Unit and integration tests — 99 tests, no credentials needed

| File | Covers |
| --- | --- |
| `tests/unit/validation.test.ts` | The shared schema: required fields, conditional guardian rules, dates, contact formats, consent flags, file type and size rules |
| `tests/unit/reference.test.ts` | Reference-number format, padding, and rejection of values that cannot fit |
| `tests/unit/emailTemplate.test.ts` | Every required element of the confirmation email, in both formats, and the absence of any acceptance claim |
| `tests/unit/crypto.test.ts` | AES-GCM round trip, unique IV, wrong key, key length, ID hashing normalisation |
| `tests/unit/logger.test.ts` | That personal data cannot reach a log line |
| `tests/unit/rateLimit.test.ts` | Peek vs consume, per-IP buckets, window reset, behaviour when KV is unavailable |
| `tests/unit/submitApplication.test.ts` | The critical path: ordering, rollback on every failure point, email retries, consent timestamps, encryption, and that a failed email never loses an application |
| `tests/unit/securityHeaders.test.ts` | Required headers, CSP tightness, and that `_headers` matches the code |

The submission tests run the real service against an in-memory implementation of
the storage port, so the rollback and retry logic is genuinely exercised without
a network.

### RLS proofs — `tests/rls/rls.test.ts`

Skipped unless `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` are set. Point them at a **local** Supabase
(`npx supabase start`) or a staging project — never production, because the
suite writes a fixture application.

```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=<anon> \
SUPABASE_SERVICE_ROLE_KEY=<service> \
npx vitest run tests/rls
```

### Browser tests — `tests/e2e/`

- `smoke.spec.ts` — **18 tests, runnable now with no credentials.** Landing page
  content and fees rendered from `courses.json`, the live countdown, the absence
  of accreditation and job-guarantee claims, all three course pages, step
  validation in the application form, the guardian step appearing only for a
  minor, the draft being written to local storage, the status page, and the
  placeholder legal pages.
- `submission.spec.ts` — the full end-to-end flow. Requires a Supabase project
  (see §14). It fills the real form in a real browser, submits, and then asserts
  the database row, both uploaded objects, the audit events and the queued email.
  It also submits a `.exe` and asserts a 422 with nothing written. **It is
  skipped, not faked, when the project is not configured.**

Run the full end-to-end suite against local Supabase with:

```bash
# terminal 1
npx supabase start && npx supabase db reset

# terminal 2 - note ENVIRONMENT=development so Turnstile is skipped
cp .env.example .dev.vars   # add SUPABASE_URL / SERVICE_ROLE_KEY, EMAIL_PROVIDER=dev
npm run build
npx wrangler pages dev dist --port 8788 --kv RATE_LIMIT

# terminal 3
E2E_SUPABASE_URL=http://127.0.0.1:54321 \
E2E_SUPABASE_SERVICE_KEY=<service> \
npx playwright test tests/e2e/submission.spec.ts
```

---

## 12. Performance

`npm run vitals` measures the real built site in Pixel 7 emulation:

```
page        LCP        CLS      FCP        TTFB     JS         CSS        total
/           136 ms     0.0000   136 ms     6 ms     18.7 kB    13.0 kB    36.2 kB
/apply/     120 ms     0.0000   120 ms     5 ms     82.6 kB    13.0 kB    97.9 kB
```

Budgets: LCP < 2500 ms, CLS < 0.1, TTFB < 800 ms, JS < 200 kB.

Notes on how this was achieved, and one honest caveat:

- No web fonts, no CSS framework, no UI framework, no images above the fold.
- The landing page ships ~19 kB of gzipped JavaScript; the application page
  ships ~19 kB gz more because it bundles the Zod schema it shares with the
  Worker. Locally `wrangler` serves these **uncompressed**, so the numbers above
  are larger than production, where Cloudflare Brotli-compresses them.
- `supabase-js` is only loaded on `/admin`, and Vite tree-shakes it out entirely
  when `VITE_SUPABASE_URL` is absent at build time — so it cannot affect the
  landing or application pages.
- **This is not a Lighthouse score.** It measures the inputs the score depends
  on. Run Lighthouse against the preview deployment before launch and confirm
  90+ on mobile for `/` and `/apply/` as the brief requires.

---

## 13. Deployment

Nothing below has been executed: it needs your Cloudflare and Supabase accounts.

### 13.1 GitHub

```bash
git add -A
git commit -m "Add the admissions site: pages, Worker, migrations, tests"
gh repo create it-career-foundation --private --source=. --remote=origin --push
```

Protect `main` (Settings → Branches → Add branch protection rule for `main`) and
enable:

- Require a pull request before merging
- Require status checks to pass, selecting the **CI** check from
  [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- Require branches to be up to date before merging
- Do not allow bypassing the above settings

CI runs `typecheck`, `test` and `build` on every pull request. It does not need
any secrets, because the unit and smoke tests are credential-free.

### 13.2 Supabase

1. Create a project at <https://supabase.com/dashboard>. Choose the region
   closest to South Africa (Mumbai or Frankfurt are the usual picks).
2. Apply the migrations **from this repository**, not by hand:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

3. Confirm in **Database → Tables** that all seven tables exist and that RLS is
   shown as enabled on each, and in **Storage** that `application-documents`
   exists and is **not** public.
4. Create the first staff account: **Authentication → Users → Add user**, then
   run the `staff_users` insert from §9 in the SQL editor.
5. Collect **Settings → API**: the project URL, the `anon` key and the
   `service_role` key.

`service_role` bypasses RLS. It belongs in Cloudflare only.

### 13.3 Cloudflare KV (rate limiting)

```bash
npx wrangler kv namespace create RATE_LIMIT
npx wrangler kv namespace create RATE_LIMIT --preview
```

Put both ids into the `[[kv_namespaces]]` block in
[`wrangler.toml`](wrangler.toml), replacing the `REPLACE_WITH_...` placeholders.
Committed ids are not secrets — they are namespace identifiers, and this is the
normal way to bind them.

### 13.4 Cloudflare Pages

Connect the repository (Dashboard → Workers & Pages → Create → Pages → Connect
to Git):

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(leave empty)* |

Then add **environment variables** for both **Production** and **Preview**:

| Variable | Kind | Notes |
| --- | --- | --- |
| `NODE_VERSION` | plain | `20` or higher |
| `VITE_SUPABASE_URL` | plain | **build-time**: baked into the admin bundle |
| `VITE_SUPABASE_ANON_KEY` | plain | Public by design |
| `VITE_TURNSTILE_SITE_KEY` | plain | Add once Turnstile exists; see §13.5 |
| `SUPABASE_URL` | plain | Used by Functions at runtime |
| `PUBLIC_APP_ORIGIN` | plain | e.g. `https://apply.example.co.za`; used in email links |
| `ENVIRONMENT` | plain | `preview` for Preview, `production` for Production |
| `EMAIL_PROVIDER` | plain | `dev`, or `knock` once §13.6 is done |
| `EMAIL_FROM` | plain | The verified sending address |
| `KNOCK_WORKFLOW_KEY` | plain | Workflow key whose email step renders the confirmation |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | Encrypt it |
| `FIELD_ENCRYPTION_KEY` | **secret** | Encrypt it |
| `TURNSTILE_SECRET` | **secret** | Encrypt it |
| `KNOCK_SECRET_KEY` | **secret** | Encrypt it; see §13.6 |

The `VITE_*` values are read at **build** time, so changing them requires a
redeploy — a runtime variable change alone will not update the admin bundle.

Prefer the CLI for the secrets so the values never pass through a browser:

```bash
npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name it-career-foundation
npx wrangler pages secret put FIELD_ENCRYPTION_KEY --project-name it-career-foundation
npx wrangler pages secret put TURNSTILE_SECRET --project-name it-career-foundation
npx wrangler pages secret put KNOCK_SECRET_KEY --project-name it-career-foundation
```

### 13.5 Turnstile

Dashboard → Turnstile → Add widget. Add the hostname, then:

- Put the **site key** in `VITE_TURNSTILE_SITE_KEY` (Pages build variables) and
  redeploy.
- Put the **secret** in `TURNSTILE_SECRET` (`wrangler pages secret put`).

Once `TURNSTILE_SECRET` is set in Production, submissions without a valid token
are rejected, and a missing secret fails closed rather than silently allowing an
unprotected form through.

### 13.6 Email delivery (Knock + Postmark)

The provider is **Knock** for orchestration and **Postmark** underneath it for
actual delivery. That is two accounts, not one, and both are needed before a
single email leaves the system.

Before you start, two limits worth knowing:

- Knock's Developer plan is **$0 up to 10,000 messages a month**
  ([pricing](https://knock.app/pricing)).
- Postmark's free developer plan is **100 emails a month**, never expires
  ([pricing](https://postmarkapp.com/pricing)). An intake above that needs a paid
  Postmark tier.
- The confirmation wording stays in this repo and is unit tested. It is passed
  to Knock as trigger data, so the Knock template must render `data.subject`,
  `data.body_html` and `data.body_text` rather than hard-coding its own copy —
  otherwise the email an applicant receives drifts away from the wording the
  brief pins down.

**Postmark**

1. Sign up at [postmarkapp.com](https://postmarkapp.com/). New accounts start on
   the free developer plan.
2. Open the address-confirmation email and click the link. Postmark will not send
   from an unconfirmed sender signature
   ([docs](https://postmarkapp.com/developer/user-guide/managing-your-account/managing-sender-signatures)).
3. `My First Server → Settings → API tokens` → copy the **Server API token**.
4. Confirm a **Transactional** message stream exists. A confirmation email is
   transactional, not a broadcast
   ([docs](https://postmarkapp.com/support/article/how-to-create-and-send-through-message-streams)).
5. Once the school's domain is decided, add a sender signature for it and verify
   SPF/DKIM against the Cloudflare DNS zone (§13.8).

**Knock**

1. Sign up at [knock.app](https://knock.app/).
2. `Platform → API keys → Create API key` → type **Secret** → copy the `sk_...`
   value. That is `KNOCK_SECRET_KEY`
   ([docs](https://docs.knock.app/developer-tools/api-keys)).
3. `Channels and sources → Add channel → Postmark` → paste the Postmark **Server
   API token** and the From address → attach it to the environment whose key you
   just created ([Postmark setup](https://docs.knock.app/integrations/email/postmark)).
4. Create a workflow with one **email step** and a template that renders
   `data.subject`, `data.body_html` and `data.body_text`. Copy its key into
   `KNOCK_WORKFLOW_KEY`.

**Wire it up**

```bash
npx wrangler pages secret put KNOCK_SECRET_KEY --project-name it-career-foundation
```

Then set `EMAIL_PROVIDER=knock` and `KNOCK_WORKFLOW_KEY` as plain environment
variables and redeploy. Until both are present the site keeps using the
development adapter. A missing `KNOCK_SECRET_KEY` does **not** fail the
applicant's submission: the send is retried three times, then recorded as failed
in `outbound_emails` for an admin to see, and the application is still saved.

**Verify it on the preview URL**

1. Submit a real application.
2. `outbound_emails` shows `sent` with a Knock `workflow_run_id`.
3. The message arrives, and Postmark → **Activity** shows the delivery.
4. Force a failure (temporarily blank `KNOCK_SECRET_KEY`) and confirm the
   application is still saved and the email row reads `failed`.

### 13.7 Staging, then production

Push a branch — Pages builds a preview deployment with its own URL automatically.
Add that preview URL to the Turnstile widget's hostnames, and set
`PUBLIC_APP_ORIGIN` for the Preview environment so email links point at the
preview.

Before promoting to production, on the preview URL:

- [ ] Submit a real application and confirm the row, both documents, the audit
      events and the `outbound_emails` row
- [ ] Confirm the documents bucket rejects an unauthenticated request
- [ ] Sign in to `/admin` as a staff account, change a status, and confirm the
      audit trail names you
- [ ] Sign in as a non-staff account and confirm you are refused
- [ ] Check the status lookup with a wrong email address returns nothing
- [ ] Run Lighthouse on `/` and `/apply/` and confirm 90+ mobile
- [ ] Trigger the rate limit and confirm the sixth submission in an hour
      is refused

Merging to `main` is the production deployment:

```bash
npx wrangler pages deploy dist --project-name it-career-foundation --branch main
```

### 13.8 Domain and SSL

1. Add the domain to Cloudflare (Dashboard → Websites → Add a site) and point
   the registrar's nameservers at the two Cloudflare nameservers shown.
2. Pages project → Custom domains → Set up a domain. Cloudflare issues and
   renews the certificate automatically.
3. Set SSL/TLS mode to **Full (strict)** and enable **Always Use HTTPS**.
4. Update `PUBLIC_APP_ORIGIN` so email links use the real domain, then redeploy.

---

## 14. What I need from you

Placeholders are visible in the UI wherever an answer is missing, so nothing
here is silently guessed.

**Decisions**
1. **VAT treatment.** Fees currently render with `[VAT treatment: TO BE
   CONFIRMED]`. Are the prices VAT-inclusive, VAT-exclusive, or is the school
   not VAT-registered?
2. **Early bird: R65,000 total, or R65,000 a month?** Displayed exactly as the
   brief specifies ("R65,000 total"), with a flag waiting on your confirmation.
3. **Salary ranges.** Held back behind `salaryRangesApprovedForDisplay: false`.
   Approve the three ranges and the "Planning ranges, not guaranteed outcomes."
   disclaimer, or leave them unpublished.
4. **Retention period.** The default is 5 years for rejected applications. Keep
   or change it.
5. **Email provider.** ✅ Chosen: Knock over Postmark. The adapter is written
   (§13.6); what is left is the Postmark sender-signature confirmation, the two
   keys, and the Knock template.

**Values I must be given**
6. School name, logo, contact email, phone number and street address
7. Domain name
8. Module descriptions for the twelve pathway modules (core module descriptions
   were supplied and are in use)
9. The laptop or device requirement for the FAQ
10. Approved accreditation and NQF wording (or a decision to publish nothing)
11. The privacy notice and the terms of enrolment
12. The final consent wording on step 6, which is currently the brief's own
    sentences marked with consent version `draft-1-unapproved`

**Credentials**
13. Supabase project URL, anon key and service role key
14. Turnstile site key and secret
15. `KNOCK_SECRET_KEY` (into Cloudflare, never into the repo) and the
    `KNOCK_WORKFLOW_KEY`, plus the From address

---

## 15. Deliberately not built

- No live sending yet: the Knock adapter is written but no key is set, so
  `EMAIL_PROVIDER` is still `dev` (§14.5, §13.6)
- No scheduled purge job for expired retention windows
- No provider-failure queue; retries are inline
- No password reset or self-service account creation for staff — accounts are
  created by an administrator
- No CSV export, no bulk actions, no reporting
- No payment handling anywhere. Sponsoring a seat is an enquiry link, as asked
- No analytics, no tracking pixels, no third-party scripts beyond Turnstile

---

## 16. Suggested next steps

1. Answer the five decisions in §14 so the placeholders can be replaced.
2. Finish the Knock + Postmark setup in §13.6 — confirm the Postmark address,
   create the workflow, then set the two keys and switch `EMAIL_PROVIDER`.
3. Create the Supabase project, run `npx supabase db push`, and run the RLS
   suite against it.
4. Connect Cloudflare Pages, run a preview deployment, and walk the
   pre-production checklist.
5. Replace the legal placeholders with approved wording.
6. Add a scheduled purge for retention windows, once the period is confirmed.
