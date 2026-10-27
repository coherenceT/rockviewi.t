import { h } from '../lib/dom';
import type { PathArt } from '../../shared/courses';

/**
 * Custom artwork for the three career paths.
 *
 * Each icon is drawn as inline SVG in the school's blue palette, so it stays
 * sharp at any size, loads with the page and needs no image files or icon CDN.
 * The shapes carry the three animation hooks the artwork uses on hover:
 * `.art-shield` glows, `.art-cloud` floats and `.art-cursor` blinks.
 */

const DEFS = [
  '<svg class="art-defs" aria-hidden="true" focusable="false" width="0" height="0">',
  '<defs>',
  '<linearGradient id="g-art-cyber" x1="0" y1="0" x2="1" y2="1">',
  '<stop offset="0" stop-color="#3f7bff" /><stop offset="1" stop-color="#0b2a8f" />',
  '</linearGradient>',
  '<linearGradient id="g-art-cloud" x1="0" y1="0" x2="1" y2="1">',
  '<stop offset="0" stop-color="#3d8bff" /><stop offset="1" stop-color="#0d2f8c" />',
  '</linearGradient>',
  '<linearGradient id="g-art-soft" x1="0" y1="0" x2="1" y2="1">',
  '<stop offset="0" stop-color="#2a6bff" /><stop offset="1" stop-color="#0b2a8f" />',
  '</linearGradient>',
  '</defs>',
  '</svg>',
].join('');

const CYBER = [
  '<rect x="1.5" y="1.5" width="93" height="93" rx="21" fill="url(#g-art-cyber)" />',
  '<g stroke="#43e0c8" stroke-width="2.6" stroke-linecap="round" fill="none">',
  '<path d="M15 21h11l7 7" /><path d="M15 75h9l7-7" /><path d="M81 21H70l-7 7" /><path d="M81 76h-9l-7-7" />',
  '</g>',
  '<g fill="#43e0c8">',
  '<circle cx="14" cy="21" r="3" /><circle cx="14" cy="75" r="3" />',
  '<circle cx="82" cy="21" r="3" /><circle cx="82" cy="76" r="3" />',
  '</g>',
  '<g class="art-shield">',
  '<path d="M48 15l22 8.2v18.4c0 15.3-9 26.2-22 32.4-13-6.2-22-17.1-22-32.4V23.2Z" fill="#f5f8ff" />',
  '<path d="M48 15l22 8.2v18.4c0 15.3-9 26.2-22 32.4-13-6.2-22-17.1-22-32.4V23.2Z" fill="none" stroke="#cfe0ff" stroke-width="1.4" />',
  '</g>',
  '<path d="M43.2 46.5v-4.6a4.8 4.8 0 0 1 9.6 0v4.6" fill="none" stroke="#0f38b4" stroke-width="3.2" stroke-linecap="round" />',
  '<rect x="38" y="46" width="20" height="16.5" rx="3.4" fill="#0f38b4" />',
  '<circle cx="48" cy="52.6" r="2.9" fill="#f5f8ff" />',
  '<rect x="46.6" y="54.6" width="2.8" height="5" rx="1.4" fill="#f5f8ff" />',
].join('');

const CLOUD = [
  '<rect x="1.5" y="1.5" width="93" height="93" rx="21" fill="url(#g-art-cloud)" />',
  '<g class="art-cloud" fill="#f5f8ff">',
  '<circle cx="35" cy="46" r="11.5" /><circle cx="50" cy="39" r="14" />',
  '<circle cx="63" cy="47" r="10.5" /><rect x="24" y="52" width="44" height="12" rx="6" />',
  '</g>',
  '<g stroke="#ffb648" stroke-width="2.6" stroke-linecap="round" fill="none">',
  '<path d="M48 64v11" /><path d="M26 79h44" />',
  '<path d="M17 57V47m-3.6 3.6L17 47l3.6 3.6" />',
  '<path d="M79 47v10m-3.6-3.6L79 57l3.6-3.6" />',
  '</g>',
  '<g fill="#0b2a8f" stroke="#ffb648" stroke-width="2.6">',
  '<circle cx="26" cy="79" r="4" /><circle cx="48" cy="79" r="4" /><circle cx="70" cy="79" r="4" />',
  '</g>',
].join('');

const SOFTWARE = [
  '<rect x="1.5" y="1.5" width="93" height="93" rx="21" fill="url(#g-art-soft)" />',
  '<rect x="14" y="20" width="68" height="56" rx="7" fill="#f5f8ff" />',
  '<path d="M14 27a7 7 0 0 1 7-7h54a7 7 0 0 1 7 7v5H14Z" fill="#cddcff" />',
  '<g fill="#9db8ff">',
  '<circle cx="23" cy="26" r="2.4" /><circle cx="30.5" cy="26" r="2.4" /><circle cx="38" cy="26" r="2.4" />',
  '</g>',
  '<g fill="none" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M40 38l-8.5 7.5L40 53" stroke="#1f5eff" />',
  '<path d="M56 38l8.5 7.5L56 53" stroke="#1f5eff" />',
  '<path d="M53 35.5l-9.5 20" stroke="#35d07f" />',
  '</g>',
  '<g fill="#b9cdff">',
  '<rect x="24" y="60" width="21" height="3.4" rx="1.7" />',
  '<rect x="49" y="60" width="13" height="3.4" rx="1.7" />',
  '<rect x="24" y="67" width="29" height="3.4" rx="1.7" />',
  '</g>',
  '<rect class="art-cursor" x="58" y="64" width="3.2" height="10.5" rx="1.6" fill="#35d07f" />',
].join('');

const SHAPES: Record<PathArt, string> = {
  cyber: CYBER,
  cloud: CLOUD,
  software: SOFTWARE,
};

/** The gradient definitions, added to the page once, on first use. */
function ensureDefs(): void {
  if (document.querySelector('.art-defs')) return;
  const host = h('span', { html: DEFS });
  const svg = host.firstElementChild;
  if (svg) document.body.appendChild(svg);
}

/**
 * One pathway icon. `title` is both the accessible name and the visible-on-hover
 * <title>, and it is always authored text, never applicant input.
 */
export function pathArt(kind: PathArt, title: string, size: 'lg' | 'sm' = 'lg'): Element {
  ensureDefs();

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `art-icon art-icon--${size}`);
  svg.setAttribute('viewBox', '0 0 96 96');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', title);
  svg.innerHTML = `<title>${title}</title>${SHAPES[kind]}`;
  return svg;
}
