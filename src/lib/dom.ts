/**
 * Tiny DOM helpers.
 *
 * Everything the pages build goes through here, and text always goes in as
 * textContent. The `html` prop exists only for markup this codebase authored
 * itself (icons, static copy) and is never given applicant-supplied values.
 */

export type Child = Node | string | number | null | undefined | false | readonly Child[];

export interface ElementProps {
  class?: string;
  text?: string;
  /** Only ever pass strings authored in this repository. */
  html?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: Record<string, EventListener>;
  dataset?: Record<string, string>;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      append(parent, ...child);
      continue;
    }
    if (child instanceof Node) {
      parent.appendChild(child);
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;

  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [name, value] of Object.entries(props.dataset ?? {})) {
    node.dataset[name] = value;
  }
  for (const [event, listener] of Object.entries(props.on ?? {})) {
    node.addEventListener(event, listener);
  }

  append(node, ...children);
  return node;
}

export function qs<T extends Element = Element>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function qsa<T extends Element = Element>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function render(target: string | Element, ...children: Child[]): Element | null {
  const host = typeof target === 'string' ? qs(target) : target;
  if (!host) return null;
  clear(host);
  append(host, ...children);
  return host;
}

/** Reads a data attribute from the document root, used to pick a pathway page. */
export function bodyData(name: string): string | null {
  return document.body.dataset[name] ?? null;
}

/**
 * Escape hatch for unavoidable HTML strings (for example a value that must
 * include a <br>). Prefer `h(..., { text })` everywhere else.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: '2-digit' });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reads and writes the local draft. localStorage is unavailable in some privacy
 * modes, so every call is defensive and a failure is never fatal.
 */
export const draftStore = {
  read<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  write(key: string, value: unknown): boolean {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* nothing to do */
    }
  },
};
