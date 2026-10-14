/**
 * Measures the Core Web Vitals that a Lighthouse mobile score depends on, on
 * the real built site served by `wrangler pages dev`.
 *
 * Lighthouse itself is the authority for the score; this script exists so the
 * numbers can be checked repeatedly without a full Lighthouse run, and so a
 * regression is caught in seconds. Run it against a preview deployment before
 * launch and confirm the score in Lighthouse then.
 *
 *   npm run build && npx wrangler pages dev dist --port 8788   # in one terminal
 *   npm run vitals
 */

import { chromium, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:8788';
const TARGETS = ['/', '/apply/'];
const SETTLE_MS = 3000;

const VITALS_INIT = () => {
  const state = { lcp: 0, cls: 0, shifts: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.lcp = Math.max(state.lcp, entry.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          state.cls += entry.value;
          state.shifts += 1;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    /* older engines: leave the zeros in place */
  }
  window.__vitals = state;
};

function bytes(value) {
  return `${(value / 1024).toFixed(1)} kB`;
}

const browser = await chromium.launch();
const results = [];

for (const path of TARGETS) {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();

  const transfer = { document: 0, script: 0, style: 0, font: 0, image: 0, other: 0 };
  const requests = [];

  page.on('response', async (response) => {
    const type = response.request().resourceType();
    let size = 0;
    try {
      size = (await response.body()).length;
    } catch {
      size = 0;
    }
    // Playwright reports CSS as 'stylesheet'; the table column is 'style'.
    const normalised = type === 'stylesheet' ? 'style' : type;
    const bucket = normalised in transfer ? normalised : 'other';
    transfer[bucket] += size;
    requests.push({ type, size, url: response.url() });
  });

  await page.addInitScript(VITALS_INIT);
  const started = Date.now();
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'load' });
  const loadMs = Date.now() - started;
  await page.waitForTimeout(SETTLE_MS);

  const measured = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      lcp: window.__vitals?.lcp ?? 0,
      cls: window.__vitals?.cls ?? 0,
      shifts: window.__vitals?.shifts ?? 0,
      ttfb: navigation ? navigation.responseStart : 0,
      domContentLoaded: navigation ? navigation.domContentLoadedEventEnd : 0,
      fcp: fcp ? fcp.startTime : 0,
    };
  });

  const totalBytes = Object.values(transfer).reduce((sum, value) => sum + value, 0);

  results.push({
    path,
    ...measured,
    loadMs,
    totalBytes,
    js: transfer.script,
    css: transfer.style,
    html: transfer.document,
    requests: requests.length,
    slowest: requests.sort((a, b) => b.size - a.size).slice(0, 3),
  });

  await context.close();
}

await browser.close();

console.log('\nCore Web Vitals (Pixel 7 emulation, local wrangler pages dev)\n');
console.log(
  ['page', 'LCP', 'CLS', 'FCP', 'TTFB', 'JS', 'CSS', 'total', 'reqs'].map((h) => h.padEnd(12)).join(''),
);
for (const result of results) {
  console.log(
    [
      result.path,
      `${Math.round(result.lcp)} ms`,
      result.cls.toFixed(4),
      `${Math.round(result.fcp)} ms`,
      `${Math.round(result.ttfb)} ms`,
      bytes(result.js),
      bytes(result.css),
      bytes(result.totalBytes),
      String(result.requests),
    ]
      .map((cell) => String(cell).padEnd(12))
      .join(''),
  );
}

console.log('\nBudgets used for a 90+ mobile Lighthouse score:');
console.log('  LCP  < 2500 ms   CLS < 0.1   TTFB < 800 ms   JS < 200 kB\n');

console.log('Largest responses per page:');
for (const result of results) {
  console.log(`  ${result.path}`);
  for (const request of result.slowest) {
    console.log(`    ${bytes(request.size).padStart(10)}  ${request.type.padEnd(10)} ${request.url.replace(BASE_URL, '')}`);
  }
}

const failures = results.filter(
  (result) => result.lcp > 2500 || result.cls > 0.1 || result.ttfb > 800 || result.js > 200 * 1024,
);
if (failures.length > 0) {
  console.log('\nOut of budget:', failures.map((result) => result.path).join(', '));
  process.exitCode = 1;
} else {
  console.log('\nAll pages within budget.');
}
