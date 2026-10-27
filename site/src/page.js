/* =====================================================================
   Rockview I.T. — page script
   Everything is vanilla, inline, and safe to edit.

   THREE THINGS TO FILL IN BEFORE LAUNCH
   1. CONTACT  — phone, WhatsApp and email (leave blank to keep "to confirm")
   2. WHATSAPP — the number in international format, no plus: '27821234567'
   3. FORM_ENDPOINT — a Formspree / Apps Script / Sheets URL. When set, the
      form POSTs JSON there. When blank, the form hands off to WhatsApp.
   ===================================================================== */

const CONTACT = {
  phone: '', // e.g. '+27 33 000 0000'
  whatsapp: '', // e.g. '+27 82 000 0000'
  email: '', // e.g. 'admissions@rockview.co.za'
};

const WHATSAPP_NUMBER = ''; // international format, digits only
const FORM_ENDPOINT = ''; // set this to receive applications by email/Sheets

const OPENING = '2027-02-01T08:00:00+02:00';
const SCHOOL = 'Rockview I.T.';

/* ------------------------------------------------------------------ paths */

// Tuition only. Certification exam fees are covered by the school, so there
// is no separate exam-fee figure anywhere in the page.
const PATHS = {
  cyber: {
    label: 'Cybersecurity',
    monthly: 5000,
    months: 10,
  },
  cloud: {
    label: 'Cloud engineering',
    monthly: 4000,
    months: 10,
  },
  software: {
    label: 'Software engineering',
    monthly: 3500,
    months: 10,
  },
};

const SPOTS = [
  {
    id: 'who',
    num: '01',
    index: 'Who it is for',
    title: 'Matric school-leavers',
    copy: 'No degree needed. If you are finishing matric, or finished recently, this is built for you.',
    cue: '#who',
    cueLabel: 'Jump to who it is for',
  },
  {
    id: 'timetable',
    num: '02',
    index: 'Timetable',
    title: '20 hours a week',
    copy: 'Mon 08:00–12:00, Tue 08:00–15:00, Wed to Fri 12:00–15:00. In person, Northdale.',
    cue: '#timetable',
    cueLabel: 'Jump to the timetable',
  },
  {
    id: 'laptop',
    num: '03',
    index: 'Bring your own',
    title: 'Your own laptop',
    copy: 'Windows or Mac, charged and with you every day. You will use it in every session.',
    cue: '#laptop',
    cueLabel: 'Jump to the laptop requirement',
  },
  {
    id: 'seats',
    num: '04',
    index: 'Limited seats',
    title: 'One small class',
    copy: 'Seats are confirmed as applications are processed. When the intake is full, it is full.',
    cue: '#seats',
    cueLabel: 'Jump to seats',
  },
  {
    id: 'fees',
    num: '05',
    index: 'Fees',
    title: 'From R3,500 a month',
    copy: 'Ten monthly payments, and your certification exam fees are covered by the school. Every number is published.',
    cue: '#fees',
    cueLabel: 'Jump to fees',
  },
  {
    id: 'countdown',
    num: '06',
    index: 'Countdown',
    title: 'Doors open 1 Feb 2027',
    copy: 'First session 08:00, Northdale, Pietermaritzburg. Applications are open now.',
    cue: '#countdown',
    cueLabel: 'Jump to the countdown',
  },
];

/* ------------------------------------------------------------------ helpers */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hoverCapable = () => window.matchMedia('(hover: hover)').matches;

/* -------------------------------------------------------------------- theme */

const root = document.documentElement;
const themeButton = $('[data-theme-toggle]');
const THEME_KEY = 'rockview-theme';

function storedTheme() {
  try {
    return window.localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;

  if (!themeButton) return;
  const isDark =
    theme === 'dark' ||
    (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  themeButton.setAttribute('aria-pressed', String(isDark));
  themeButton.setAttribute(
    'aria-label',
    isDark ? 'Switch to light theme' : 'Switch to dark theme',
  );
}

const savedTheme = storedTheme();
applyTheme(savedTheme);

themeButton?.addEventListener('click', () => {
  const isDark =
    root.dataset.theme === 'dark' ||
    (!root.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const next = isDark ? 'light' : 'dark';
  applyTheme(next);
  try {
    window.localStorage.setItem(THEME_KEY, next);
  } catch {
    /* private mode: the toggle still works for this page view */
  }
});

/* ------------------------------------------------------------- mobile menu */

const menuButton = $('[data-menu-toggle]');
const menuPanel = $('[data-menu]');

function setMenu(open) {
  if (!menuButton || !menuPanel) return;
  menuButton.setAttribute('aria-expanded', String(open));
  menuPanel.dataset.open = String(open);
}

menuButton?.addEventListener('click', () => {
  setMenu(menuPanel?.dataset.open !== 'true');
});

menuPanel?.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('a')) setMenu(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (menuPanel?.dataset.open === 'true') {
    setMenu(false);
    menuButton?.focus();
  }
});

/* --------------------------------------------------- the six-dot mark + stage */

const mark = $('[data-mark]');
const stage = $('[data-stage]');
const card = $('[data-spot-card]');
const dots = $$('[data-dot]');
const wires = $$('[data-wire]');
const panes = $$('[data-pane]');
const meters = $$('[data-meter]');
const spotById = new Map(SPOTS.map((spot) => [spot.id, spot]));

let activeSpot = null;
let cycleTimer = 0;
let hasInteracted = false;

function setStage(id) {
  if (!stage) return;
  const spot = spotById.get(id);
  if (!spot) return;

  stage.dataset.active = spot.id;
  const num = $('[data-stage-num]', stage);
  if (num) num.textContent = spot.num;

  panes.forEach((pane) => {
    const on = pane.dataset.pane === spot.id;
    pane.classList.toggle('is-on', on);
    pane.hidden = !on;
  });

  meters.forEach((meter, index) => {
    meter.classList.toggle('is-on', index === SPOTS.findIndex((item) => item.id === spot.id));
  });
}

function setCard(spot) {
  if (!card) return;
  const num = $('[data-card-num]', card);
  const index = $('[data-card-index]', card);
  const title = $('[data-card-title]', card);
  const copy = $('[data-card-copy]', card);
  const cue = $('[data-card-cue]', card);

  if (num) num.textContent = spot.num;
  if (index) index.textContent = spot.index;
  if (title) title.textContent = spot.title;
  if (copy) copy.textContent = spot.copy;
  if (cue) {
    cue.href = spot.cue;
    cue.innerHTML = `${spot.cueLabel} <span aria-hidden="true">→</span>`;
  }
}

function paint(id, { showCard = true } = {}) {
  const spot = id ? spotById.get(id) : null;
  activeSpot = spot ? spot.id : null;

  if (spot) {
    setStage(spot.id);
    if (showCard) {
      setCard(spot);
      card.dataset.open = 'true';
    }
  } else if (card) {
    card.dataset.open = 'false';
  }

  dots.forEach((dot) => dot.classList.toggle('is-on', dot.dataset.dot === activeSpot));
  wires.forEach((wire) => {
    const ids = (wire.dataset.wire ?? '').split(' ');
    wire.classList.toggle('is-on', Boolean(activeSpot) && ids.includes(activeSpot));
  });
}

function stopCycle() {
  window.clearInterval(cycleTimer);
  cycleTimer = 0;
}

function startCycle() {
  if (hasInteracted || reducedMotion() || !stage) return;
  stopCycle();
  cycleTimer = window.setInterval(() => {
    if (document.hidden || hasInteracted) return;
    const current = SPOTS.findIndex((spot) => spot.id === activeSpot);
    const next = SPOTS[(current + 1) % SPOTS.length];
    if (next) paint(next.id, { showCard: false });
  }, 5600);
}

let closeTimer = 0;

function closeSoon() {
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => paint(null), 240);
}

function keepOpen() {
  window.clearTimeout(closeTimer);
}

// Hover is tracked on the whole mark, so the small gaps between dots and the
// trip down to the card never make the card flicker closed.
mark?.addEventListener('mouseover', (event) => {
  if (!hoverCapable()) return;
  if (!(event.target instanceof Element)) return;
  const dot = event.target.closest('[data-dot]');
  const id = dot instanceof HTMLElement ? dot.dataset.dot : undefined;
  if (!id) return;
  keepOpen();
  hasInteracted = true;
  stopCycle();
  paint(id);
});

mark?.addEventListener('mouseleave', () => {
  if (!hoverCapable()) return;
  if (document.activeElement instanceof Element && document.activeElement.closest('[data-mark]')) return;
  closeSoon();
});

card?.addEventListener('mouseenter', keepOpen);
card?.addEventListener('mouseleave', closeSoon);

dots.forEach((dot) => {
  const id = dot.dataset.dot ?? null;
  if (!id) return;

  dot.addEventListener('focus', () => {
    hasInteracted = true;
    stopCycle();
    paint(id);
  });
  dot.addEventListener('blur', () => {
    if (!hoverCapable()) paint(null);
  });
  dot.addEventListener('click', (event) => {
    hasInteracted = true;
    stopCycle();
    if (hoverCapable()) return; // anchors navigate on pointer devices
    if (card?.dataset.open === 'true' && activeSpot === id) return; // second tap follows the link
    event.preventDefault();
    paint(id);
  });
});

// Tapping anywhere else dismisses the card on touch screens.
document.addEventListener('click', (event) => {
  if (!hoverCapable() && card?.dataset.open === 'true') {
    if (!(event.target instanceof Element) || !event.target.closest('[data-mark], [data-spot-card]')) {
      paint(null);
    }
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && card?.dataset.open === 'true') paint(null);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCycle();
  else startCycle();
});

setStage('who');
startCycle();

/* --------------------------------------------------------------- countdown */

const countdown = $('[data-countdown]');
const target = new Date(OPENING).getTime();

function pad(value) {
  return String(value).padStart(2, '0');
}

function tickCountdown() {
  if (!countdown) return;
  const remaining = Math.max(0, target - Date.now());
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  const values = { days: String(days), hours: pad(hours), minutes: pad(minutes), seconds: pad(seconds) };
  for (const [key, value] of Object.entries(values)) {
    const cell = $(`[data-count="${key}"]`, countdown);
    if (cell && cell.textContent !== value) cell.textContent = value;
  }
}

tickCountdown();
window.setInterval(tickCountdown, 1000);

/* ---------------------------------------------------------- fee calculator */

const calc = $('[data-calc]');

function money(value) {
  // R50,000 — thousands separators, no locale surprises.
  return `R${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function updateCalculator() {
  if (!calc) return;
  const picked = $('input[name="fee-path"]:checked', calc);
  const path = PATHS[picked?.value] ?? PATHS.cyber;
  const tuition = path.monthly * path.months;

  const write = (selector, text) => {
    const node = $(selector, calc);
    if (node) node.textContent = text;
  };

  write('[data-calc-monthly]', money(path.monthly));
  write('[data-calc-tuition]', money(tuition));
}

$$('input[name="fee-path"]', calc ?? document).forEach((input) => {
  input.addEventListener('change', updateCalculator);
});
updateCalculator();

/* ------------------------------------------------ contact + WhatsApp wiring */

function whatsappHref(text) {
  const base = WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

const defaultWaText = `Hi ${SCHOOL}, I would like to apply for the February 2027 intake.`;

$$('[data-wa-link]').forEach((link) => {
  link.href = whatsappHref(defaultWaText);
  link.target = '_blank';
  link.rel = 'noopener';
  if (!WHATSAPP_NUMBER) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const contact = document.querySelector('#contact');
      if (contact) {
        contact.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
        const phone = document.querySelector('[data-contact="whatsapp"]');
        phone?.focus?.({ preventScroll: true });
      }
    });
  }
});

let contactPhone = $('[data-contact="phone"]');
let contactWhatsApp = $('[data-contact="whatsapp"]');
let contactEmail = $('[data-contact="email"]');

if (CONTACT.phone && contactPhone) {
  contactPhone.href = `tel:${CONTACT.phone.replace(/[^\d+]/g, '')}`;
  contactPhone.textContent = CONTACT.phone;
}
if (CONTACT.whatsapp && contactWhatsApp) {
  contactWhatsApp.href = whatsappHref(defaultWaText);
  contactWhatsApp.textContent = CONTACT.whatsapp;
  contactWhatsApp.target = '_blank';
  contactWhatsApp.rel = 'noopener';
}
if (CONTACT.email && contactEmail) {
  contactEmail.href = `mailto:${CONTACT.email}`;
  contactEmail.textContent = CONTACT.email;
}

const yearSlot = $('[data-year]');
if (yearSlot) yearSlot.textContent = String(new Date().getFullYear());

/* ------------------------------------------------------------- the form */

const form = $('[data-apply-form]');
const success = $('[data-form-success]');
const successTitle = $('[data-success-title]');
const successCopy = $('[data-success-copy]');
const successSummary = $('[data-success-summary]');
const successWa = $('[data-success-wa]');
const editButton = $('[data-success-edit]');
const demoNote = $('[data-form-demo]');

const isLocalPreview = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
if (demoNote && !FORM_ENDPOINT && isLocalPreview) demoNote.dataset.on = 'true';

const MATRIC_LABELS = {
  2027: '2027 (writing this year)',
  2026: '2026 (writing this year)',
  2025: '2025',
  2024: '2024',
  2023: '2023',
  2022: '2022',
  2021: '2021',
  earlier: 'Earlier than 2021',
};

const PATH_LABELS = {
  cyber: 'Cybersecurity',
  cloud: 'Cloud engineering',
  software: 'Software engineering',
  unsure: 'Not sure yet',
};

function fieldWrap(name) {
  const input = form?.elements.namedItem(name);
  return input instanceof HTMLElement ? input.closest('.field, .check') : null;
}

function setInvalid(name, invalid, message) {
  const input = form?.elements.namedItem(name);
  const wrap = fieldWrap(name);
  if (!(input instanceof HTMLElement) || !wrap) return;

  wrap.dataset.invalid = String(invalid);
  if (name === 'consent') {
    const errorNode = document.querySelector('#f-consent-error');
    if (errorNode) errorNode.dataset.visible = String(invalid);
  }
  if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox') {
    input.setAttribute('aria-invalid', String(invalid));
  }
  if (message) {
    const errorNode = wrap.querySelector('.field__error');
    if (errorNode) errorNode.textContent = message;
  }
}

function readForm() {
  if (!form) return null;
  const data = new FormData(form);
  return {
    name: String(data.get('name') ?? '').trim(),
    email: String(data.get('email') ?? '').trim(),
    phone: String(data.get('phone') ?? '').trim(),
    matric: String(data.get('matric') ?? ''),
    path: String(data.get('path') ?? ''),
    consent: data.get('consent') === 'on',
  };
}

function validate(values) {
  const errors = {};
  if (values.name.length < 2) errors.name = 'Please write your full name.';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) {
    errors.email = 'Enter an email like name@example.com.';
  }

  const digits = values.phone.replace(/[^\d]/g, '');
  if (digits.length < 9) errors.phone = 'Enter a number we can call, e.g. 072 000 0000.';

  if (!values.matric) errors.matric = 'Choose the year you wrote or will write matric.';
  if (!values.path) errors.path = 'Choose a path, or “not sure yet”.';
  if (!values.consent) errors.consent = 'Please tick the box so we can contact you.';

  return errors;
}

function summaryMarkup(values) {
  const rows = [
    ['Name', values.name],
    ['Email', values.email],
    ['Phone', values.phone],
    ['Matric year', MATRIC_LABELS[values.matric] ?? values.matric],
    ['Path', PATH_LABELS[values.path] ?? values.path],
  ];

  return rows
    .map(([label, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      const row = document.createElement('div');
      row.append(dt, dd);
      return row;
    })
    .reduce((fragment, row) => {
      fragment.append(row);
      return fragment;
    }, document.createDocumentFragment());
}

function whatsappApplication(values) {
  return [
    `Hi ${SCHOOL}, here is my application for the February 2027 intake.`,
    '',
    `Name: ${values.name}`,
    `Email: ${values.email}`,
    `Phone: ${values.phone}`,
    `Matric year: ${MATRIC_LABELS[values.matric] ?? values.matric}`,
    `Preferred path: ${PATH_LABELS[values.path] ?? values.path}`,
  ].join('\n');
}

function showSuccess(values, mode) {
  if (!form || !success) return;

  form.hidden = true;
  success.dataset.on = 'true';

  if (successTitle) {
    successTitle.textContent =
      mode === 'sent' ? `Thank you, ${values.name.split(' ')[0]}.` : `One more step, ${values.name.split(' ')[0]}.`;
  }

  if (successCopy) {
    successCopy.textContent =
      mode === 'sent'
        ? 'Your application has been received. We will contact you on the phone number and email you gave us.'
        : 'Your application is filled in and checked. The online submission service is not connected yet, so this page cannot send it. Use WhatsApp below once the school number is confirmed.';
  }

  if (successSummary) {
    successSummary.replaceChildren(summaryMarkup(values));
  }

  if (successWa) {
    successWa.href = whatsappHref(whatsappApplication(values));
    successWa.target = '_blank';
    successWa.rel = 'noopener';
    successWa.hidden = mode === 'sent';
  }

  success.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  if (successTitle) {
    successTitle.tabIndex = -1;
    successTitle.focus({ preventScroll: true });
  }
}

form?.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  const wrap = target.closest('.field, .check');
  if (wrap instanceof HTMLElement && wrap.dataset.invalid === 'true') {
    wrap.dataset.invalid = 'false';
    if (target.type === 'checkbox') {
      const errorNode = document.querySelector('#f-consent-error');
      if (errorNode) errorNode.dataset.visible = 'false';
    } else {
      target.removeAttribute('aria-invalid');
    }
  }
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const values = readForm();
  if (!values) return;

  const errors = validate(values);
  const names = ['name', 'email', 'phone', 'matric', 'path', 'consent'];
  names.forEach((name) => setInvalid(name, Boolean(errors[name]), errors[name]));

  const firstError = names.find((name) => errors[name]);
  if (firstError) {
    const wrap = fieldWrap(firstError);
    const focusable = wrap?.querySelector('input, select');
    if (focusable instanceof HTMLElement) focusable.focus();
    return;
  }

  const submit = form.querySelector('button[type="submit"]');
  if (submit instanceof HTMLButtonElement) {
    submit.disabled = true;
    submit.textContent = 'Sending…';
  }

  if (!FORM_ENDPOINT) {
    showSuccess(values, 'review');
    if (submit instanceof HTMLButtonElement) {
      submit.disabled = false;
      submit.textContent = 'Send my application';
    }
    return;
  }

  try {
    const response = await fetch(FORM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...values, source: window.location.href }),
    });

    if (!response.ok) throw new Error(`The form endpoint returned ${response.status}`);
    showSuccess(values, 'sent');
    form.reset();
  } catch {
    if (submit instanceof HTMLButtonElement) {
      submit.disabled = false;
      submit.innerHTML = 'Send my application<span class="btn__arrow" aria-hidden="true">→</span>';
    }
    showSuccess(values, 'review');
    if (successCopy) {
      successCopy.textContent =
        'Something went wrong sending the form. Please try again, or send the same details on WhatsApp.';
    }
  }
});

editButton?.addEventListener('click', () => {
  if (!form || !success) return;
  success.dataset.on = 'false';
  form.hidden = false;
  form.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  const first = form.querySelector('input, select');
  if (first instanceof HTMLElement) first.focus({ preventScroll: true });
});

/* Path links on the cards pre-select the form. */
$$('[data-path-select]').forEach((link) => {
  link.addEventListener('click', () => {
    const id = link.dataset.pathSelect;
    const select = $('#f-path');
    if (!id || !(select instanceof HTMLSelectElement)) return;
    select.value = id;
    window.setTimeout(() => select.focus({ preventScroll: true }), 420);
  });
});

/* ------------------------------------------------------- reveal on scroll */

const revealTargets = $$('[data-reveal]');

if ('IntersectionObserver' in window && !reducedMotion()) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.06 },
  );

  revealTargets.forEach((target) => observer.observe(target));
} else {
  revealTargets.forEach((target) => target.classList.add('is-in'));
}

/* ------------------------------------------------------------ small polish */

// Keep the year in the footer current even if the file sits untouched.
const navLinks = $$('.site-nav a[href^="#"]');
if ('IntersectionObserver' in window) {
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute('href') ?? ''))
    .filter((section) => section instanceof HTMLElement);

  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => {
          link.setAttribute(
            'aria-current',
            String(link.getAttribute('href') === `#${entry.target.id}`),
          );
        });
      });
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );

  sections.forEach((section) => spy.observe(section));
}
