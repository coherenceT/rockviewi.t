import { legal, programme, routes, school } from '../../shared/config';
import { h, render } from '../lib/dom';

/**
 * The header and footer are rendered from shared/config.ts.
 *
 * The school name, contact details and the accreditation placeholder therefore
 * appear in exactly one place in the codebase, which is what makes "change the
 * name in one file" true rather than aspirational.
 */

function navLink(href: string, label: string) {
  return h('li', {}, h('a', { attrs: { href }, text: label }));
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
        h(
          'a',
          { class: 'brand', attrs: { href: routes.home, 'aria-label': `${school.name} home` } },
          h('span', { class: 'brand__mark', attrs: { 'aria-hidden': 'true' }, text: 'IT' }),
          h('span', { class: 'brand__name', text: school.name }),
        ),
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
              navLink('/#pathways', 'Pathways'),
              navLink('/#fees', 'Fees'),
              navLink('/#faq', 'Questions'),
              navLink(routes.status, 'Check status'),
            ),
          ),
        ),
        h(
          'nav',
          { class: 'site-nav site-nav--wide', attrs: { 'aria-label': 'Main' } },
          h(
            'ul',
            { class: 'site-nav__list' },
            navLink('/#pathways', 'Pathways'),
            navLink('/#fees', 'Fees'),
            navLink('/#faq', 'Questions'),
            navLink(routes.status, 'Check status'),
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
          h('h2', { text: school.name }),
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
            h('li', {}, h('a', { attrs: { href: routes.apply }, text: 'Start an application' })),
            h('li', {}, h('a', { attrs: { href: routes.status }, text: 'Check application status' })),
            h('li', {}, h('a', { attrs: { href: routes.privacy }, text: 'Privacy notice' })),
            h('li', {}, h('a', { attrs: { href: routes.terms }, text: 'Terms of enrolment' })),
          ),
        ),
      ),
      h(
        'div',
        { class: 'site-footer__legal' },
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
}
