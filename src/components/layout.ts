import { legal, programme, routes, school } from '../../shared/config';
import { h, render } from '../lib/dom';
import { brandLockup, initBrandMark, initBrandScrollSpy } from './brand';

/**
 * The header and footer are rendered from shared/config.ts.
 *
 * The school name, contact details and the accreditation placeholder therefore
 * appear in exactly one place in the codebase, which is what makes "change the
 * name in one file" true rather than aspirational.
 */

/**
 * The mobile menu is a <details> element, so it stays open after an in-page
 * jump unless it is closed deliberately. Choosing a destination closes it, and
 * so do a click outside the menu and the Escape key.
 */
function initNavToggle(): void {
  const toggle = document.querySelector<HTMLDetailsElement>('.nav-toggle');
  if (!toggle) return;

  for (const link of Array.from(toggle.querySelectorAll('a'))) {
    link.addEventListener('click', () => {
      toggle.open = false;
    });
  }

  document.addEventListener('click', (event) => {
    if (!toggle.open) return;
    if (event.target instanceof Node && !toggle.contains(event.target)) toggle.open = false;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !toggle.open) return;
    toggle.open = false;
    toggle.querySelector('summary')?.focus();
  });
}

function navLink(href: string, label: string, brandRef?: string) {
  return h(
    'li',
    {},
    h('a', {
      attrs: { href },
      dataset: brandRef ? { brandRef } : undefined,
      text: label,
    }),
  );
}

export function renderHeader(): void {
  render(
    '#site-header',
    h(
      'div',
      { class: 'container' },
      h(
        'div',
        { class: 'site-header__inner' },
        brandLockup(),
        h(
          'details',
          { class: 'nav-toggle' },
          h('summary', { text: 'Menu' }),
          h(
            'nav',
            { class: 'site-nav', attrs: { 'aria-label': 'Main' } },
            h(
              'ul',
              { class: 'site-nav__list' },
              navLink('/#overview', 'School', 'school'),
              navLink('/#pathways', 'Pathways', 'pathways'),
              navLink('/#certifications', 'Certifications'),
              navLink('/#fees', 'Fees', 'fees'),
              navLink('/#faq', 'Questions'),
              navLink(routes.status, 'Status', 'status'),
            ),
          ),
        ),
        h(
          'nav',
          { class: 'site-nav site-nav--wide', attrs: { 'aria-label': 'Main' } },
          h(
            'ul',
            { class: 'site-nav__list' },
          navLink('/#pathways', 'Pathways', 'pathways'),
          navLink('/#certifications', 'Certifications'),
          navLink('/#fees', 'Fees', 'fees'),
          navLink('/#faq', 'Questions'),
          navLink(routes.status, 'Check status', 'status'),
          ),
        ),
        h('a', { class: 'btn btn--primary header-cta', attrs: { href: routes.apply }, text: 'Apply now' }),
      ),
    ),
  );
}

export function renderFooter(): void {
  render(
    '#site-footer',
    h(
      'div',
      { class: 'container' },
      h(
        'div',
        { class: 'site-footer__grid' },
        h(
          'div',
          {},
          h('h2', { text: 'Rockview I.T.' }),
          h('p', { text: school.tagline }),
          h('p', { text: school.location }),
        ),
        h(
          'div',
          {},
          h('h2', { text: 'Contact' }),
          h(
            'ul',
            {},
            h('li', {}, h('a', { attrs: { href: `mailto:${school.contact.email}` }, text: school.contact.email })),
            h('li', {}, h('a', { attrs: { href: `tel:${school.contact.phone.replace(/\s/g, '')}` }, text: school.contact.phone })),
            ...school.contact.addressLines.map((line) => h('li', { text: line })),
          ),
        ),
        h(
          'div',
          {},
          h('h2', { text: 'Apply' }),
          h(
            'ul',
            {},
            h(
              'li',
              {},
              h('a', { attrs: { href: routes.apply }, dataset: { brandRef: 'apply' }, text: 'Start an application' }),
            ),
            h(
              'li',
              {},
              h('a', {
                attrs: { href: routes.status },
                dataset: { brandRef: 'status' },
                text: 'Check application status',
              }),
            ),
            h('li', {}, h('a', { attrs: { href: routes.privacy }, text: 'Privacy notice' })),
            h('li', {}, h('a', { attrs: { href: routes.terms }, text: 'Terms of enrolment' })),
          ),
        ),
      ),
      h(
        'div',
        {
          class: 'site-footer__legal',
          attrs: { id: 'contact', 'data-spot-chip': '06 · Contact' },
          dataset: { brandSpot: 'contact' },
        },
        h('p', { text: legal.accreditationPlaceholder }),
        h('p', {
          text: `${programme.deliveryMode} programme, ${programme.startLabel} to ${programme.endLabel}. Places are confirmed only after the admissions decision and payment steps.`,
        }),
        h('p', { text: school.contact.confirmed ? '' : '[Contact details: TO BE CONFIRMED]' }),
      ),
    ),
  );
}

export function initLayout(): void {
  renderHeader();
  renderFooter();
  initBrandMark();
  initBrandScrollSpy();
  initNavToggle();
}
