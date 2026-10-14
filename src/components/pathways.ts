import { courses, getPathway, salaryRangeLine, type CourseModule } from '../../shared/courses';
import { h, render } from '../lib/dom';

/**
 * Pathway and module content comes from courses.json.
 *
 * Module descriptions for the three pathways were not supplied with the brief,
 * so they render as an explicit "to be confirmed" placeholder rather than
 * invented marketing copy. Filling them in is a courses.json edit.
 */

export function pathwayCard(pathwayId: string) {
  const pathway = getPathway(pathwayId);
  if (!pathway) return null;

  const salary = salaryRangeLine(pathway);

  return h(
    'article',
    { class: 'card' },
    h('p', { class: 'card__meta', text: `Pathway ${pathway.id.toUpperCase()}` }),
    h('h3', {}, h('a', { attrs: { href: `/courses/${pathway.id}` }, text: pathway.name })),
    h('p', { text: pathway.summary }),
    h(
      'ul',
      { class: 'tick-list' },
      h('li', { text: `${pathway.modules.length} pathway modules, ${courses.creditEquivalents} credit-equivalents` }),
      h('li', { text: 'Shared morning core included' }),
      h('li', { text: 'Capstone and work-integrated learning in semester 2' }),
    ),
    salary ? h('p', { text: salary }) : null,
    h(
      'p',
      { class: 'card__foot' },
      h('a', { class: 'btn btn--secondary', attrs: { href: `/courses/${pathway.id}` }, text: 'View pathway' }),
    ),
  );
}

export function renderPathwayCards(selector: string): void {
  const cards = courses.pathways.map((pathway) => pathwayCard(pathway.id)).filter((card) => card !== null);
  render(selector, ...cards);
}

export function moduleList(modules: readonly CourseModule[]) {
  return h(
    'ol',
    { class: 'grid grid--2' },
    ...modules.map((module) =>
      h(
        'li',
        { class: 'card' },
        h('p', { class: 'card__meta', text: `Semester ${module.semester}` }),
        h('h3', { text: module.title }),
        module.description
          ? h('p', { text: module.description })
          : h(
              'p',
              {},
              h('span', { class: 'placeholder-tag', text: '[Module description: TO BE CONFIRMED]' }),
            ),
      ),
    ),
  );
}

export function renderCoreModules(selector: string): void {
  render(
    selector,
    h('h3', { text: courses.core.title }),
    h('p', { class: 'muted', text: courses.core.subtitle }),
    moduleList(courses.core.modules),
  );
}

export function renderPathwayModules(selector: string, pathwayId: string): void {
  const pathway = getPathway(pathwayId);
  if (!pathway) return;
  render(selector, moduleList(pathway.modules));
}

export function renderSalaryNote(selector: string, pathwayId: string): void {
  const pathway = getPathway(pathwayId);
  if (!pathway) return;
  const salary = salaryRangeLine(pathway);

  // Nothing is shown until the school approves the ranges for display.
  if (!salary) {
    render(selector);
    return;
  }

  render(
    selector,
    h(
      'div',
      { class: 'notice notice--info' },
      h('p', {}, h('strong', { text: salary })),
      h('p', { text: courses.salaryNote }),
    ),
  );
}
