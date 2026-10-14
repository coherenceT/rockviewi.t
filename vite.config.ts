import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));

/** Every static route in the site, as a path to its HTML entry file. */
const PAGES = [
  'index.html',
  'courses/a/index.html',
  'courses/b/index.html',
  'courses/c/index.html',
  'apply/index.html',
  'apply/thank-you/index.html',
  'status/index.html',
  'admin/index.html',
  'privacy/index.html',
  'terms/index.html',
];

function entryName(page: string): string {
  const trimmed = page.replace(/\/index\.html$/, '').replace(/index\.html$/, 'home');
  return trimmed.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
}

export default defineConfig({
  root,
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: true,
    rollupOptions: {
      input: Object.fromEntries(PAGES.map((page) => [entryName(page), resolve(root, page)])),
    },
  },
  server: {
    port: 5173,
  },
});
