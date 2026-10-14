import '../styles/main.css';
import { initLayout } from '../components/layout';
import { renderEarlyBirdPanel, renderFeesTable, renderPaymentOptions } from '../components/fees';
import { renderCoreModules, renderPathwayModules, renderSalaryNote } from '../components/pathways';
import { courses, getPathway, isPathwayId } from '../../shared/courses';
import { programme, routes, school } from '../../shared/config';
import { bodyData, h, render } from '../lib/dom';

/**
 * One page per pathway. The pathway is chosen by the data-pathway attribute on
 * <body>, so the three pages share a single implementation and a single source
 * of content.
 */

function renderOverview(pathwayId: string): void {
  const pathway = getPathway(pathwayId);
  if (!pathway) return;

  render(
    '#pathway-overview',
    h('p', { class: 'card__meta', text: `Pathway ${pathway.id.toUpperCase()}` }),
    h('h1', { text: pathway.name }),
    h('p', { class: 'section__lead', text: pathway.summary }),
    h(
      'div',
      { class: 'table-wrap mt-5' },
      h(
        'table',
        {},
        h('caption', { text: 'How the week runs' }),
        h(
          'tbody',
          {},
          h(
            'tr',
            {},
            h('th', { attrs: { scope: 'row' }, text: 'Morning core' }),
            h('td', { text: programme.schedule.morningCore }),
          ),
          h(
            'tr',
            {},
            h('th', { attrs: { scope: 'row' }, text: 'Afternoon pathway' }),
            h('td', { text: programme.schedule.afternoonPathway }),
          ),
          h(
            'tr',
            {},
            h('th', { attrs: { scope: 'row' }, text: 'Friday' }),
            h('td', { text: programme.schedule.friday }),
          ),
          h(
            'tr',
            {},
            h('th', { attrs: { scope: 'row' }, text: 'Credit-equivalents' }),
            h('td', { text: `${courses.creditEquivalents} for the shared core, ${courses.creditEquivalents} for the pathway` }),
          ),
        ),
      ),
    ),
  );
  renderSalaryNote('#pathway-salary', pathwayId);
}

function renderCta(pathwayId: string): void {
  const applyHref = `${routes.apply}?pathway=${encodeURIComponent(pathwayId)}`;
  render(
    '#pathway-cta',
    h(
      'div',
      { class: 'notice notice--info' },
      h('h3', { text: 'Ready to apply?' }),
      h('p', {
        text: `Applications for the ${programme.startLabel} intake are open. Your pathway is one step in the application, and you can change it later by contacting admissions.`,
      }),
      h(
        'div',
        { class: 'btn-row' },
        h('a', { class: 'btn btn--primary', attrs: { href: applyHref }, text: `Apply for pathway ${pathwayId.toUpperCase()}` }),
        h('a', { class: 'btn btn--secondary', attrs: { href: routes.status }, text: 'Check an application' }),
      ),
    ),
  );
}

function main(): void {
  initLayout();

  const pathwayId = bodyData('pathway') ?? '';
  if (!isPathwayId(pathwayId)) {
    render('#main', h('h1', { text: 'Pathway not found' }), h('p', { text: 'Please choose a pathway from the home page.' }));
    return;
  }

  renderOverview(pathwayId);
  renderCoreModules('#core-modules');
  renderPathwayModules('#pathway-modules', pathwayId);
  renderFeesTable('#fees-table');
  renderEarlyBirdPanel('#early-bird-panel');
  renderPaymentOptions('#payment-options');
  renderCta(pathwayId);

  const pathway = getPathway(pathwayId);
  if (pathway) document.title = `${pathway.name} — ${school.name}`;
}

main();
