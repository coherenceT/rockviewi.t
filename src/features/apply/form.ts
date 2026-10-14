import { api, programme, routes } from '../../../shared/config';
import { getPathway } from '../../../shared/courses';
import {
  calculateAge,
  formatFieldErrors,
  submissionPayloadSchema,
  validateDocumentFile,
} from '../../../shared/validation';
import { append, draftStore, formatBytes, h, qs, render } from '../../lib/dom';
import {
  DOCUMENT_STEP_INDEX,
  REVIEW_STEP_INDEX,
  STEPS,
  stepFieldNames,
  type FieldDef,
  type StepDef,
} from './steps';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement | string, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      getResponse: (widgetId?: string) => string | undefined;
    };
  }
}

const DRAFT_KEY = 'apply-draft-v1';
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

type FieldValue = string | boolean;

interface DraftShape {
  values: Record<string, FieldValue>;
  stepIndex: number;
}

interface State {
  values: Record<string, FieldValue>;
  /** Uploaded documents live in memory only: a File cannot be put in a draft. */
  files: Map<string, File>;
  stepIndex: number;
  errors: Map<string, string>;
  formMessage: { kind: 'error' | 'info'; text: string } | null;
  submitting: boolean;
  turnstileWidgetId: string | null;
}

const state: State = {
  values: {},
  files: new Map(),
  stepIndex: 0,
  errors: new Map(),
  formMessage: null,
  submitting: false,
  turnstileWidgetId: null,
};

/* -------------------------------------------------------------------------- */
/* Step helpers                                                                */
/* -------------------------------------------------------------------------- */

function isMinor(): boolean {
  const dob = state.values.dateOfBirth;
  if (typeof dob !== 'string' || dob.length !== 10) return false;
  const age = calculateAge(dob);
  return Number.isFinite(age) && age < 18;
}

function visibleSteps(): StepDef[] {
  return STEPS.filter((step) => !step.minorOnly || isMinor());
}

function currentStep(): StepDef {
  const list = visibleSteps();
  return list[Math.min(state.stepIndex, list.length - 1)] as StepDef;
}

function buildPayload(): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    programmeMode: 'full_time',
    startDate: programme.startDate,
  };

  for (const step of STEPS) {
    for (const field of step.fields) {
      if (field.type === 'file') continue;
      const value = state.values[field.name];

      if (field.type === 'checkbox') {
        payload[field.name] = value === true;
      } else if (field.type === 'number') {
        if (typeof value === 'string' && value.trim() !== '') payload[field.name] = Number(value);
      } else if (typeof value === 'string' && value !== '') {
        payload[field.name] = value;
      }
    }
  }

  return payload;
}

function saveDraft(): void {
  const ok = draftStore.write(DRAFT_KEY, { values: state.values, stepIndex: state.stepIndex } satisfies DraftShape);
  const status = qs('#apply-draft-status');
  if (status) {
    status.textContent = ok
      ? `Draft saved in this browser at ${new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}. Documents are not saved in the draft.`
      : 'This browser is blocking local storage, so your draft cannot be saved. Keep this tab open until you submit.';
  }
}

function restoreDraft(): void {
  const draft = draftStore.read<DraftShape>(DRAFT_KEY);
  if (!draft || !draft.values || Object.keys(draft.values).length === 0) return;

  state.values = draft.values;
  state.stepIndex = typeof draft.stepIndex === 'number' ? Math.max(0, draft.stepIndex) : 0;

  render(
    '#apply-restored',
    h(
      'div',
      { class: 'notice notice--info' },
      h('p', {
        text: 'We restored the draft you saved in this browser. Check the details before you submit. Uploaded documents are not kept in the draft, so you may need to attach them again.',
      }),
      h(
        'p',
        {},
        h('button', {
          class: 'btn btn--ghost',
          attrs: { type: 'button' },
          text: 'Discard the draft and start again',
          on: {
            click: () => {
              draftStore.remove(DRAFT_KEY);
              state.values = {};
              state.files.clear();
              state.stepIndex = 0;
              state.errors.clear();
              render('#apply-restored');
              returnToStep(0);
            },
          },
        }),
      ),
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

function renderStepIndicator(): void {
  const list = visibleSteps();
  const current = state.stepIndex;

  render(
    '#apply-steps',
    ...list.map((step, index) => {
      const stepState = index === current ? 'current' : index < current ? 'done' : 'todo';
      return h(
        'li',
        { dataset: { state: stepState } },
        h('span', { class: 'steps__index', attrs: { 'aria-hidden': 'true' }, text: String(index + 1) }),
        step.title,
        index === current ? h('span', { class: 'visually-hidden', text: ' (current step)' }) : null,
      );
    }),
  );

  const bar = qs<HTMLElement>('#apply-progress');
  if (bar) {
    const percent = list.length <= 1 ? 100 : Math.round((current / (list.length - 1)) * 100);
    bar.style.width = `${percent}%`;
    const progress = qs<HTMLElement>('#apply-progress-wrap');
    progress?.setAttribute('aria-valuenow', String(current + 1));
    progress?.setAttribute('aria-valuemax', String(list.length));
  }
}

function optionLabel(field: FieldDef, value: string): string {
  return field.options?.find((option) => option.value === value)?.label ?? value;
}

function fieldControl(field: FieldDef): Node {
  const id = `field-${field.name}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [field.hint ? hintId : null, state.errors.has(field.name) ? errorId : null]
    .filter(Boolean)
    .join(' ');
  const invalid = state.errors.has(field.name);

  if (field.type === 'checkbox') {
    const input = h('input', {
      attrs: {
        type: 'checkbox',
        id,
        name: field.name,
        checked: state.values[field.name] === true,
        'aria-describedby': describedBy || null,
        'aria-invalid': invalid ? 'true' : null,
      },
    });
    input.addEventListener('change', () => {
      state.values[field.name] = input.checked;
      clearError(field.name);
      saveDraft();
    });

    const label = h('label', { attrs: { for: id } }, field.label);
    if (field.name === 'termsAccepted') {
      append(label, ' ');
      append(label, h('a', { attrs: { href: routes.terms }, text: 'Terms of enrolment' }));
      append(label, ' and ');
      append(label, h('a', { attrs: { href: routes.privacy }, text: 'Privacy notice' }));
      append(label, '.');
    }

    return h('div', { class: `checkbox${field.required ? ' checkbox--required' : ''}` }, input, label);
  }

  if (field.type === 'file') {
    const input = h('input', {
      attrs: {
        type: 'file',
        id,
        name: field.name,
        accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
        'aria-describedby': describedBy || null,
        'aria-invalid': invalid ? 'true' : null,
      },
    });
    const nameLine = h('p', {
      class: 'file-field__name',
      text: state.files.has(field.name) ? `${state.files.get(field.name)!.name}` : 'No file chosen yet',
    });

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        state.files.delete(field.name);
        nameLine.textContent = 'No file chosen yet';
        return;
      }
      const verdict = validateDocumentFile({ name: file.name, type: file.type, size: file.size });
      if (!verdict.ok) {
        state.files.delete(field.name);
        input.value = '';
        nameLine.textContent = 'No file chosen yet';
        setError(field.name, verdict.message ?? 'That file cannot be accepted.');
        return;
      }
      state.files.set(field.name, file);
      nameLine.textContent = `${file.name} (${formatBytes(file.size)})`;
      clearError(field.name);
    });

    return h('div', { class: 'file-field' }, input, nameLine);
  }

  const common = {
    id,
    name: field.name,
    'aria-describedby': describedBy || null,
    'aria-invalid': invalid ? 'true' : null,
    autocomplete: field.autocomplete ?? null,
  };

  if (field.type === 'select') {
    const select = h('select', { attrs: { ...common, required: field.required ? true : null } });
    select.appendChild(h('option', { attrs: { value: '' }, text: 'Please choose…' }));
    for (const option of field.options ?? []) {
      select.appendChild(
        h('option', { attrs: { value: option.value, selected: state.values[field.name] === option.value }, text: option.label }),
      );
    }
    select.addEventListener('change', () => {
      state.values[field.name] = select.value;
      clearError(field.name);
      saveDraft();
    });
    return select;
  }

  if (field.type === 'textarea') {
    const textarea = h('textarea', { attrs: { ...common, rows: field.rows ?? 4, maxlength: field.maxLength ?? null } });
    textarea.value = typeof state.values[field.name] === 'string' ? (state.values[field.name] as string) : '';
    textarea.addEventListener('input', () => {
      state.values[field.name] = textarea.value;
      clearError(field.name);
      saveDraft();
    });
    return textarea;
  }

  const input = h('input', {
    attrs: {
      ...common,
      type: field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : field.type,
      inputmode: field.inputMode ?? null,
      maxlength: field.maxLength ?? null,
      /**
       * No min/max on the date input: a future date must be caught by
       * validation with a clear message rather than silently blocked by the
       * browser's own error text.
       */
      value: typeof state.values[field.name] === 'string' ? (state.values[field.name] as string) : '',
    },
  });

  input.addEventListener('input', () => {
    state.values[field.name] = input.value;
    clearError(field.name);
    saveDraft();
  });

  if (field.type === 'date') {
    // The date of birth decides whether the guardian step applies.
    input.addEventListener('change', () => {
      state.values[field.name] = input.value;
      renderStepIndicator();
    });
  }

  return input;
}

function setError(name: string, message: string): void {
  state.errors.set(name, message);
  const anchor = qs<HTMLElement>(`#field-${name}`);
  const container = anchor?.closest('.field, .checkbox');
  if (!container) return;

  container.querySelector('.field__error')?.remove();
  container.appendChild(h('p', { class: 'field__error', attrs: { id: `field-${name}-error`, role: 'alert' }, text: message }));
  anchor?.setAttribute('aria-invalid', 'true');
}

function clearError(name: string): void {
  if (!state.errors.has(name)) return;
  state.errors.delete(name);
  const anchor = qs<HTMLElement>(`#field-${name}`);
  const container = anchor?.closest('.field, .checkbox');
  container?.querySelector('.field__error')?.remove();
  anchor?.removeAttribute('aria-invalid');
  renderFormMessage();
}

function renderFormMessage(): void {
  if (!state.formMessage) {
    render('#apply-errors');
    return;
  }
  render(
    '#apply-errors',
    h(
      'div',
      { class: `notice ${state.formMessage.kind === 'error' ? 'notice--danger' : 'notice--info'}`, attrs: { role: 'alert' } },
      h('p', { text: state.formMessage.text }),
    ),
  );
}

function renderReview(): void {
  const rows: HTMLElement[] = [];

  for (const step of STEPS) {
    for (const field of step.fields) {
      if (field.type === 'file') {
        const file = state.files.get(field.name);
        rows.push(
          h(
            'div',
            {},
            h('dt', { text: field.label }),
            h('dd', { text: file ? `${file.name} (${formatBytes(file.size)})` : 'Not attached' }),
          ),
        );
        continue;
      }
      if (field.type === 'checkbox') {
        rows.push(
          h(
            'div',
            {},
            h('dt', { text: field.label }),
            h('dd', { text: state.values[field.name] === true ? 'Yes' : 'No' }),
          ),
        );
        continue;
      }
      const raw = state.values[field.name];
      const text = typeof raw === 'string' && raw !== '' ? optionLabel(field, raw) : '—';
      rows.push(h('div', {}, h('dt', { text: field.label }), h('dd', { text })));
    }
  }

  const pathway = typeof state.values.pathway === 'string' ? getPathway(state.values.pathway) : undefined;

  render(
    '#apply-fields',
    h('h2', { text: 'Review your application' }),
    h('p', {
      text: pathway
        ? `You are applying for the ${programme.deliveryMode} programme starting ${programme.startLabel}, on pathway ${pathway.id.toUpperCase()}: ${pathway.name}.`
        : `You are applying for the ${programme.deliveryMode} programme starting ${programme.startLabel}.`,
    }),
    h('dl', { class: 'review-list mt-5' }, ...rows),
    h(
      'div',
      { class: 'notice notice--info mt-5' },
      h('p', {
        text: 'When you submit, you will receive a reference number and a confirmation email that says we have received your application. That email does not confirm a place.',
      }),
    ),
    h('div', { class: 'mt-5', attrs: { id: 'turnstile-container' } }),
  );

  if (!TURNSTILE_SITE_KEY) {
    render(
      '#turnstile-container',
      h('p', {}, h('span', { class: 'placeholder-tag', text: '[Bot protection: TURNSTILE SITE KEY NOT CONFIGURED]' })),
      h('p', {
        class: 'muted',
        text: 'This deployment has no Turnstile site key, so submission may be refused. Ask the school to add VITE_TURNSTILE_SITE_KEY.',
      }),
    );
    return;
  }

  void mountTurnstile();
}

async function mountTurnstile(): Promise<void> {
  const container = qs<HTMLElement>('#turnstile-container');
  if (!container || !TURNSTILE_SITE_KEY) return;

  try {
    await loadTurnstileScript();
    if (!window.turnstile) throw new Error('turnstile unavailable');
    container.replaceChildren();
    state.turnstileWidgetId = window.turnstile.render(container, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'light',
    });
  } catch {
    render(
      '#turnstile-container',
      h('div', {
        class: 'notice notice--danger',
        text: 'The bot protection check could not load. Check your connection, then reload the page.',
      }),
    );
  }
}

let turnstilePromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (turnstilePromise) return turnstilePromise;

  turnstilePromise = new Promise<void>((resolve, reject) => {
    if (window.turnstile) return resolve();

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      turnstilePromise = null;
      reject(new Error('turnstile script failed to load'));
    };
    document.head.appendChild(script);
  });

  return turnstilePromise;
}

function renderNav(): void {
  const list = visibleSteps();
  const isReview = state.stepIndex >= list.length - 1;
  const buttons: HTMLElement[] = [];

  if (state.stepIndex > 0) {
    buttons.push(
      h('button', {
        class: 'btn btn--secondary',
        attrs: { type: 'button' },
        text: 'Back',
        on: { click: () => goToStep(state.stepIndex - 1) },
      }),
    );
  }

  buttons.push(
    isReview
      ? h('button', {
          class: 'btn btn--primary',
          attrs: { type: 'submit', 'data-testid': 'submit-application', disabled: state.submitting },
          text: state.submitting ? 'Submitting…' : 'Submit application',
        })
      : h('button', {
          class: 'btn btn--primary',
          attrs: { type: 'button', 'data-testid': 'next-step' },
          text: state.stepIndex === 0 ? 'Start' : 'Next',
          on: { click: () => goToStep(state.stepIndex + 1) },
        }),
  );

  render('#apply-nav', ...buttons);
}

function renderStep(): void {
  const step = currentStep();
  const host = qs<HTMLElement>('#apply-fields');
  if (!host) return;

  renderStepIndicator();

  if (step.id === 'review') {
    renderReview();
    renderNav();
    return;
  }

  const blocks: HTMLElement[] = [h('h2', { text: step.title })];

  if (step.id === 'guardian' && !isMinor()) {
    // The step is in the visible list only for minors, so this is a safety net.
    blocks.push(h('p', { text: 'Guardian details are not required because the applicant is 18 or older.' }));
    render('#apply-fields', ...blocks);
    renderNav();
    return;
  }

  if (step.description) blocks.push(h('p', { class: 'section__lead', text: step.description }));

  if (step.id === 'documents') {
    blocks.push(
      h('div', { class: 'notice notice--info' }, [
        h('p', {
          text: 'Attach a certified copy of your ID or passport and your highest qualification. Proof of residence is optional. Each file can be a PDF, JPG or PNG up to 10 MB.',
        }),
      ]),
    );
  }

  const fields = h('div', {});
  for (const field of step.fields) {
    const control = fieldControl(field);
    if (field.type === 'checkbox') {
      fields.appendChild(control);
      continue;
    }
    const wrapper = h('div', { class: 'field' });
    const label = h('label', { attrs: { for: `field-${field.name}` } }, field.label);
    if (field.required && field.type !== 'file') label.appendChild(h('span', { attrs: { 'aria-hidden': 'true' }, text: ' *' }));
    if (field.type === 'file' && field.required) label.appendChild(h('span', { attrs: { 'aria-hidden': 'true' }, text: ' *' }));

    wrapper.appendChild(label);
    if (field.hint) {
      wrapper.appendChild(
        h('p', { class: 'field__hint', attrs: { id: `field-${field.name}-hint` }, text: field.hint }),
      );
    }
    wrapper.appendChild(control);

    if (state.errors.has(field.name)) {
      wrapper.appendChild(
        h('p', { class: 'field__error', attrs: { id: `field-${field.name}-error`, role: 'alert' }, text: state.errors.get(field.name)! }),
      );
    }
    fields.appendChild(wrapper);
  }

  blocks.push(fields);
  render('#apply-fields', ...blocks);
  renderNav();

  const firstInvalid = qs<HTMLElement>('[aria-invalid="true"]');
  (firstInvalid ?? qs<HTMLElement>('#apply-fields h2'))?.focus?.();
}

/* -------------------------------------------------------------------------- */
/* Navigation and validation                                                   */
/* -------------------------------------------------------------------------- */

function validateCurrentStep(): boolean {
  state.errors.clear();
  const step = currentStep();
  const names = new Set(stepFieldNames(step));
  const payload = buildPayload();
  const result = submissionPayloadSchema.safeParse(payload);

  if (!result.success) {
    for (const issue of formatFieldErrors(result.error)) {
      const root = issue.field.split('.')[0] ?? issue.field;
      if (names.has(root)) state.errors.set(root, issue.message);
    }
  }

  if (step.id === 'documents') {
    for (const field of step.fields) {
      if (field.type !== 'file') continue;
      const file = state.files.get(field.name);
      if (!file) {
        if (field.required) state.errors.set(field.name, 'Please attach this document.');
        continue;
      }
      const verdict = validateDocumentFile({ name: file.name, type: file.type, size: file.size });
      if (!verdict.ok) state.errors.set(field.name, verdict.message ?? 'That file cannot be accepted.');
    }
  }

  return state.errors.size === 0;
}

function goToStep(index: number): void {
  const list = visibleSteps();
  const target = Math.max(0, Math.min(index, list.length - 1));

  if (target > state.stepIndex && !validateCurrentStep()) {
    state.formMessage = {
      kind: 'error',
      text: 'Please fix the highlighted fields before you continue.',
    };
    renderStep();
    renderFormMessage();
    return;
  }

  state.formMessage = null;
  state.stepIndex = target;
  saveDraft();
  renderStep();
  renderFormMessage();
  qs('#apply-fields')?.scrollIntoView({ block: 'start' });
}

function returnToStep(index: number): void {
  state.stepIndex = Math.max(0, index);
  renderStep();
  renderFormMessage();
}

/** Jumps to the first step that contains one of the given field names. */
function jumpToFirstErrorStep(fields: string[]): void {
  const list = visibleSteps();
  for (let index = 0; index < list.length; index += 1) {
    const names = new Set(stepFieldNames(list[index] as StepDef));
    if (fields.some((field) => names.has(field))) {
      state.stepIndex = index;
      renderStep();
      return;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Submission                                                                  */
/* -------------------------------------------------------------------------- */

interface ApiResponseBody {
  ok?: boolean;
  referenceNumber?: string;
  thankYouUrl?: string;
  error?: { code?: string; message?: string; fields?: Array<{ field: string; message: string }> };
}

async function submit(): Promise<void> {
  state.formMessage = null;

  const payload = buildPayload();
  const parsed = submissionPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    state.errors.clear();
    const allFields: string[] = [];
    for (const issue of formatFieldErrors(parsed.error)) {
      const root = issue.field.split('.')[0] ?? issue.field;
      state.errors.set(root, issue.message);
      allFields.push(root);
    }
    state.formMessage = { kind: 'error', text: 'Some details still need attention. We have marked them below.' };
    jumpToFirstErrorStep(allFields);
    renderFormMessage();
    return;
  }

  for (const step of STEPS) {
    for (const field of step.fields) {
      if (field.type === 'file' && field.required && !state.files.has(field.name)) {
        state.formMessage = { kind: 'error', text: 'A required document is missing. Go back to the documents step and attach it.' };
        jumpToFirstErrorStep([field.name]);
        renderFormMessage();
        return;
      }
    }
  }

  let turnstileToken: string | undefined;
  if (TURNSTILE_SITE_KEY) {
    turnstileToken = window.turnstile?.getResponse(state.turnstileWidgetId ?? undefined);
    if (!turnstileToken) {
      state.formMessage = { kind: 'error', text: 'Please complete the bot protection check above, then submit again.' };
      renderFormMessage();
      return;
    }
  }

  const form = new FormData();
  form.append('payload', JSON.stringify(parsed.data));
  for (const [documentType, file] of state.files) form.append(documentType, file, file.name);
  if (turnstileToken) form.append('turnstileToken', turnstileToken);

  state.submitting = true;
  renderNav();

  try {
    const response = await fetch(api.applications, { method: 'POST', body: form });
    const data = (await response.json().catch(() => ({}))) as ApiResponseBody;

    if (response.ok && data.ok && data.referenceNumber) {
      draftStore.remove(DRAFT_KEY);
      window.location.assign(data.thankYouUrl ?? routes.thankYou(data.referenceNumber));
      return;
    }

    if (response.status === 422 && data.error?.fields) {
      state.errors.clear();
      const fields: string[] = [];
      for (const issue of data.error.fields) {
        const root = issue.field.split('.')[0] ?? issue.field;
        state.errors.set(root, issue.message);
        fields.push(root);
      }
      state.formMessage = { kind: 'error', text: data.error.message ?? 'Please correct the highlighted fields.' };
      jumpToFirstErrorStep(fields.length > 0 ? fields : ['certified_id']);
      renderFormMessage();
      return;
    }

    state.formMessage = {
      kind: 'error',
      text: data.error?.message ?? 'Your application could not be submitted just now. Please try again in a few minutes.',
    };
    renderFormMessage();
    if (TURNSTILE_SITE_KEY) window.turnstile?.reset(state.turnstileWidgetId ?? undefined);
  } catch {
    state.formMessage = {
      kind: 'error',
      text: 'We could not reach the server. Check your connection and try again — your details are still in this browser.',
    };
    renderFormMessage();
  } finally {
    state.submitting = false;
    renderNav();
  }
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export function initApplyForm(pathwayFromQuery: string | null): void {
  const stored = state.values.pathway;
  if (!stored && pathwayFromQuery && getPathway(pathwayFromQuery)) {
    state.values.pathway = pathwayFromQuery;
  }

  restoreDraft();

  const form = qs<HTMLFormElement>('#apply-form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });

  renderStep();
  renderFormMessage();
}

export const FORM_CONSTANTS = { DRAFT_KEY, REVIEW_STEP_INDEX, DOCUMENT_STEP_INDEX };
