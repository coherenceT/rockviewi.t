import { routes } from '../../shared/config';
import { h, qs, qsa } from '../lib/dom';

/** Scoped query helper; avoids passing a DOM element into the shared ParentNode type. */
function within<T extends Element>(root: Element, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/**
 * The Rockview I.T. six-dot mark.
 *
 * The dots are not decoration: each one is a real link to a different part of
 * the school site, and hovering or focusing one opens a small information card
 * under the mark. The same hover also lights the matching region further down
 * the page, so the logo works as a live map of the site rather than a picture.
 *
 * Dot coordinates mirror the artwork in public/rockview-logo-revision.svg: six
 * outer nodes around one junction, including the extended "apply" node on the
 * right. Numbers are percentages of the mark's own box.
 */

interface BrandSpot {
  readonly id: 'school' | 'pathways' | 'fees' | 'apply' | 'status' | 'contact';
  readonly num: string;
  readonly label: string;
  readonly blurb: string;
  readonly cue: string;
  readonly href: string;
  readonly x: number;
  readonly y: number;
}

const JUNCTION = { x: 50, y: 49.5 } as const;

const SPOTS: readonly BrandSpot[] = [
  {
    id: 'school',
    num: '01',
    label: 'The school',
    blurb: 'Practical, full-time IT training in Northdale, Pietermaritzburg.',
    cue: 'See the school',
    href: '/#overview',
    x: 24.5,
    y: 25.7,
  },
  {
    id: 'pathways',
    num: '02',
    label: 'Pathways',
    blurb: 'One shared morning core, then the afternoon route you choose.',
    cue: 'Explore the pathways',
    href: '/#pathways',
    x: 50,
    y: 13.5,
  },
  {
    id: 'fees',
    num: '03',
    label: 'Fees and payment',
    blurb: 'Every plan and amount, exactly as the school publishes it.',
    cue: 'See fees and plans',
    href: '/#fees',
    x: 76.1,
    y: 25.7,
  },
  {
    id: 'apply',
    num: '04',
    label: 'Apply',
    blurb: 'Seven short steps. Your draft saves in this browser as you go.',
    cue: 'Start an application',
    href: routes.apply,
    x: 80.5,
    y: 49.5,
  },
  {
    id: 'status',
    num: '05',
    label: 'Application status',
    blurb: 'Track an application with your reference number and email.',
    cue: 'Check your status',
    href: routes.status,
    x: 24.5,
    y: 74.4,
  },
  {
    id: 'contact',
    num: '06',
    label: 'Contact',
    blurb: 'Admissions details, the campus location and who to ask.',
    cue: 'Get in touch',
    href: '/#contact',
    x: 76.1,
    y: 74.4,
  },
];

function wireMarkup(): string {
  const spokes = SPOTS.map(
    (spot) =>
      `<line data-brand-wire="${spot.id}" x1="${JUNCTION.x}" y1="${JUNCTION.y}" x2="${spot.x}" y2="${spot.y}" />`,
  ).join('');

  return [
    '<svg class="brand__wires" viewBox="0 0 100 100" aria-hidden="true" focusable="false">',
    `<g class="brand__spokes">${spokes}</g>`,
    `<circle class="brand__junction" cx="${JUNCTION.x}" cy="${JUNCTION.y}" r="2.1" />`,
    '</svg>',
  ].join('');
}

function dot(spot: BrandSpot) {
  return h(
    'a',
    {
      class: 'brand__dot',
      attrs: {
        href: spot.href,
        title: `${spot.num} ${spot.label}`,
        'aria-label': `${spot.num} of 06 — ${spot.label}. ${spot.blurb}`,
        style: `--x:${spot.x}%;--y:${spot.y}%`,
      },
      dataset: { brandDot: spot.id },
    },
    h(
      'span',
      { class: 'brand__pin', attrs: { 'aria-hidden': 'true' } },
      h('i', { text: spot.num }),
    ),
  );
}

/** The logo lockup: mark with six live dots, wordmark, and the hover card. */
export function brandLockup(): HTMLElement {
  return h(
    'div',
    { class: 'brand-lockup', dataset: { brandLockup: '' } },
    h(
      'span',
      { class: 'brand__mark', attrs: { role: 'group', 'aria-label': 'Six quick links to the school' } },
      h('span', { class: 'brand__glow', attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'brand__wires-host', html: wireMarkup() }),
      ...SPOTS.map(dot),
    ),
    h(
      'span',
      { class: 'brand__text' },
      h(
        'a',
        { class: 'brand__wordmark', attrs: { href: routes.home, 'aria-label': 'Rockview I.T. home' } },
        'Rockview ',
        h('span', { text: 'I.T.' }),
      ),
      h('span', { class: 'brand__hint', text: 'Learn IT for real' }),
    ),
    h(
      'div',
      { class: 'brand-card', attrs: { 'aria-hidden': 'true' } },
      h(
        'p',
        { class: 'brand-card__kicker' },
        h('span', { class: 'brand-card__num', dataset: { cardNum: '' }, text: '01' }),
        h('span', { text: 'of 06' }),
      ),
      h('p', { class: 'brand-card__title', dataset: { cardTitle: '' }, text: 'The school' }),
      h('p', { class: 'brand-card__copy', dataset: { cardCopy: '' } }),
      h(
        'p',
        { class: 'brand-card__cue' },
        h('span', { dataset: { cardCue: '' } }),
        h('i', { attrs: { 'aria-hidden': 'true' }, text: '→' }),
      ),
      h(
        'span',
        { class: 'brand-card__meter', attrs: { 'aria-hidden': 'true' } },
        ...SPOTS.map((spot) => h('i', { dataset: { cardTick: spot.id } })),
      ),
    ),
  );
}

/**
 * Connects the mark to the page: dot hover/focus updates the card, the dot
 * state and every [data-brand-spot] region further down the document. Links
 * marked [data-brand-ref] update the mark in the other direction.
 */
export function initBrandMark(): void {
  const lockup = qs<HTMLElement>('[data-brand-lockup]');
  if (!lockup) return;

  const dots = within<HTMLElement>(lockup, '[data-brand-dot]');
  const wires = within<SVGLineElement>(lockup, '[data-brand-wire]');
  const ticks = within<HTMLElement>(lockup, '[data-card-tick]');
  const regions = qsa<HTMLElement>('[data-brand-spot]');
  const refs = qsa<HTMLElement>('[data-brand-ref]');
  const cardNum = lockup.querySelector<HTMLElement>('[data-card-num]');
  const cardTitle = lockup.querySelector<HTMLElement>('[data-card-title]');
  const cardCopy = lockup.querySelector<HTMLElement>('[data-card-copy]');
  const cardCue = lockup.querySelector<HTMLElement>('[data-card-cue]');

  const spotById = (id: string | null) => SPOTS.find((spot) => spot.id === id) ?? null;

  const fillCard = (spot: BrandSpot | null): void => {
    if (!spot) return;
    if (cardNum) cardNum.textContent = spot.num;
    if (cardTitle) cardTitle.textContent = spot.label;
    if (cardCopy) cardCopy.textContent = spot.blurb;
    if (cardCue) cardCue.textContent = spot.cue;
  };

  const setActive = (id: string | null, showCard: boolean): void => {
    const spot = spotById(id);

    if (spot) {
      lockup.dataset.active = spot.id;
      if (showCard) {
        fillCard(spot);
        lockup.dataset.card = '';
      } else {
        delete lockup.dataset.card;
      }
    } else {
      delete lockup.dataset.active;
      delete lockup.dataset.card;
    }

    for (const dotEl of dots) {
      dotEl.classList.toggle('is-active', dotEl.dataset.brandDot === spot?.id);
    }
    for (const wire of wires) {
      wire.classList.toggle('is-active', wire.getAttribute('data-brand-wire') === spot?.id);
    }
    for (const tick of ticks) {
      tick.classList.toggle('is-on', tick.dataset.cardTick === spot?.id);
    }
    for (const region of regions) {
      region.classList.toggle('is-spotlit', region.dataset.brandSpot === spot?.id);
    }
    for (const ref of refs) {
      ref.classList.toggle('is-brand-active', ref.dataset.brandRef === spot?.id);
    }

    const root = document.documentElement;
    if (spot) root.dataset.brand = spot.id;
    else delete root.dataset.brand;
  };

  const clear = (): void => setActive(null, false);

  for (const dotEl of dots) {
    const id = dotEl.dataset.brandDot ?? null;
    dotEl.addEventListener('mouseenter', () => setActive(id, true));
    dotEl.addEventListener('focus', () => setActive(id, true));
    dotEl.addEventListener('mouseleave', clear);
    dotEl.addEventListener('blur', clear);
  }

  // Hovering the matching link elsewhere on the page lights the logo dot.
  for (const ref of refs) {
    const id = ref.dataset.brandRef ?? null;
    ref.addEventListener('mouseenter', () => setActive(id, false));
    ref.addEventListener('focus', () => setActive(id, false));
    ref.addEventListener('mouseleave', clear);
    ref.addEventListener('blur', clear);
  }

  lockup.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      clear();
      (document.activeElement as HTMLElement | null)?.blur();
    }
  });
}

/**
 * Scroll spy for the mark.
 *
 * Whichever live region is in the reading band lights its own dot, so the logo
 * shows where on the page you are, not only what you are hovering. It uses its
 * own class (is-inview) so it never fights the hover/focus state above.
 */
export function initBrandScrollSpy(): void {
  const lockup = qs<HTMLElement>('[data-brand-lockup]');
  const regions = qsa<HTMLElement>('[data-brand-spot]');
  if (!lockup || regions.length === 0 || !('IntersectionObserver' in window)) return;

  const dots = within<HTMLElement>(lockup, '[data-brand-dot]');
  const wires = within<SVGLineElement>(lockup, '[data-brand-wire]');
  const ticks = within<HTMLElement>(lockup, '[data-card-tick]');
  const inView = new Set<string>();

  const paint = (): void => {
    // Document order decides, so two regions on screen never both claim the mark.
    const active =
      regions
        .map((region) => region.dataset.brandSpot ?? '')
        .find((id) => id !== '' && inView.has(id)) ?? null;

    for (const dot of dots) dot.classList.toggle('is-inview', dot.dataset.brandDot === active);
    for (const wire of wires) {
      wire.classList.toggle('is-inview', wire.getAttribute('data-brand-wire') === active);
    }
    for (const tick of ticks) tick.classList.toggle('is-inview', tick.dataset.cardTick === active);

    if (active) lockup.dataset.inview = active;
    else delete lockup.dataset.inview;
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.brandSpot ?? '';
        if (id === '') continue;
        if (entry.isIntersecting) inView.add(id);
        else inView.delete(id);
      }
      paint();
    },
    { rootMargin: '-42% 0px -50% 0px' },
  );

  regions.forEach((region) => observer.observe(region));
}
