import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { programme } from '../../shared/config';

/**
 * courses.json is read from disk rather than imported: Node's ESM loader wants an
 * import attribute for JSON, and reading the same file the site is built from
 * keeps this a genuine check that the pages follow the config.
 */
const courses = JSON.parse(readFileSync(resolve(process.cwd(), 'shared/courses.json'), 'utf8')) as {
  currencySymbol: string;
  fees: {
    months: number;
    examFeesCoveredLine: string;
    earlyBird: { seats: number; closesLabel: string; displayLine: string };
  };
  pathways: { id: string; tuition: { monthly: number; months: number; total: number } }[];
};
const fees = courses.fees;

function formatRand(amount: number): string {
  return `${courses.currencySymbol}${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function pathwayTuition(id: string): { monthly: number; months: number; total: number } {
  const pathway = courses.pathways.find((item) => item.id === id);
  if (!pathway) throw new Error(`pathway ${id} is missing from courses.json`);
  return pathway.tuition;
}

/**
 * Smoke tests that need no credentials: they render the real built site through
 * `wrangler pages dev` and exercise the form's client-side validation.
 *
 * Nothing here submits an application - that is in submission.spec.ts, which
 * needs a Supabase project.
 */

test.describe('landing page', () => {
  test('renders the hero, pathways and fee table from courses.json', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Practical IT career training');

    // Three pathway cards, each linking to its course page.
    const cards = page.locator('#pathway-cards article');
    await expect(cards).toHaveCount(3);
    // Each card links to its course page twice: the title and the button.
    for (const id of ['a', 'b', 'c']) {
      const links = page.locator(`#pathway-cards a[href="/courses/${id}"]`);
      expect(await links.count()).toBeGreaterThan(0);
      await expect(links.first()).toBeVisible();
    }

    // One row per pathway, priced from the single price config file.
    await expect(page.locator('#fees-table tbody tr')).toHaveCount(3);
    await expect(page.locator('#fees-table')).toContainText(formatRand(pathwayTuition('b').total));
    await expect(page.locator('#fees-table')).toContainText(formatRand(pathwayTuition('a').monthly));
    await expect(page.locator('#fees-table')).toContainText('certification exam fees are covered by the school');

    // The fee calculator follows the pathway the visitor picks, and never shows
    // a separate exam-fee line.
    await expect(page.locator('#fee-calculator .calc__included')).toContainText('Exam fees included');
    await page.locator('#fee-calculator input[value="b"]').check({ force: true });
    await expect(page.locator('#fee-calculator')).toContainText(formatRand(pathwayTuition('b').monthly));
    await expect(page.locator('#fee-calculator')).toContainText(formatRand(pathwayTuition('b').total));

    // The early-bird line is quoted exactly as published.
    await expect(page.locator('#early-bird-panel')).toContainText(fees.earlyBird.displayLine);

    // The countdown to the early-bird closing date is live.
    await expect(page.locator('#early-bird-panel .countdown')).toBeVisible();
    await expect(page.locator('#early-bird-panel .countdown__label').first()).toHaveText('Days');
  });

  test('does not claim accreditation, a job guarantee, or an NQF qualification', async ({ page }) => {
    await page.goto('/');
    const body = (await page.locator('body').innerText()).toLowerCase();

    expect(body).toContain('accreditation wording: to be confirmed');
    expect(body).not.toContain('guaranteed job');
    expect(body).not.toMatch(/is accredited/);
    expect(body).not.toMatch(/\bnqf\b/);

    // The job guarantee question is answered honestly.
    await page.getByText('Is there a job guarantee?', { exact: false }).click();
    await expect(page.locator('.faq')).toContainText('No. We do not offer a job guarantee');
  });

  test('shows the class size the brief specifies', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#why-list')).toContainText(String(programme.maxLearnersPerLecturer));
  });

  test('sets the security headers on the static HTML', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();

    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).not.toContain('unsafe-eval');
  });
});

test.describe('course pages', () => {
  for (const pathway of ['a', 'b', 'c'] as const) {
    test(`pathway ${pathway} renders its modules and fees`, async ({ page }) => {
      await page.goto(`/courses/${pathway}`);

      await expect(page.locator('#pathway-overview')).toContainText(`Pathway ${pathway.toUpperCase()}`);
      await expect(page.locator('#core-modules .card')).toHaveCount(4);
      await expect(page.locator('#pathway-modules .card')).toHaveCount(4);

      // One tuition row per pathway, and this pathway's total is on the page.
      await expect(page.locator('#fees-table tbody tr')).toHaveCount(3);
      await expect(page.locator('#fees-table')).toContainText(formatRand(pathwayTuition(pathway).total));

      // Salary ranges are not published until the school approves them.
      await expect(page.locator('#pathway-salary')).toBeEmpty();

      await expect(page.locator('#pathway-cta a').first()).toHaveAttribute(
        'href',
        `/apply?pathway=${pathway}`,
      );
    });
  }

  test('course descriptions are marked as to be confirmed rather than invented', async ({ page }) => {
    await page.goto('/courses/a');
    await expect(page.locator('#pathway-modules')).toContainText('[Module description: TO BE CONFIRMED]');
  });
});

test.describe('application form', () => {
  test('blocks the first step until required fields are filled', async ({ page }) => {
    await page.goto('/apply/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Apply to the school');
    await page.getByTestId('next-step').click();

    await expect(page.locator('#apply-errors')).toContainText('Please fix the highlighted fields');
    await expect(page.getByLabel('First name')).toHaveAttribute('aria-invalid', 'true');
  });

  test('advances once the personal details are valid and remembers the draft', async ({ page }) => {
    await page.goto('/apply/');

    await page.getByLabel('First name').fill('Thandi');
    await page.getByLabel('Surname').fill('Mkhize');
    await page.getByLabel('Date of birth').fill('2005-03-14');
    await page.getByLabel('Email address').fill('thandi@example.com');
    await page.getByLabel('Mobile number').fill('0821234567');
    await page.getByLabel('City or town').fill('Pietermaritzburg');
    await page.getByLabel('Suburb').fill('Northdale');

    await page.getByTestId('next-step').click();

    await expect(page.locator('#apply-fields h2')).toHaveText('Your education');

    // The draft is written to local storage as the applicant types.
    const draft = await page.evaluate(() => window.localStorage.getItem('apply-draft-v1'));
    expect(draft).toContain('Thandi');
  });

  test('rejects a future date of birth with a clear message', async ({ page }) => {
    await page.goto('/apply/');

    await page.getByLabel('First name').fill('Thandi');
    await page.getByLabel('Surname').fill('Mkhize');
    await page.getByLabel('Date of birth').fill('2030-01-01');
    await page.getByLabel('Email address').fill('thandi@example.com');
    await page.getByLabel('Mobile number').fill('0821234567');
    await page.getByLabel('City or town').fill('Pietermaritzburg');
    await page.getByLabel('Suburb').fill('Northdale');

    await page.getByTestId('next-step').click();

    await expect(page.locator('#apply-fields')).toContainText('cannot be in the future');
    await expect(page.locator('#apply-fields h2')).toHaveText('Your details');
  });

  test('adds a guardian step only for an applicant under 18', async ({ page }) => {
    await page.goto('/apply/');

    // An adult sees six steps.
    await expect(page.locator('#apply-steps li')).toHaveCount(6);

    await page.getByLabel('Date of birth').fill('2010-03-14');
    await expect(page.locator('#apply-steps li')).toHaveCount(7);
    await expect(page.locator('#apply-steps')).toContainText('Guardian details');
  });

  test('pre-selects the pathway from the query string', async ({ page }) => {
    await page.goto('/apply?pathway=b');
    await page.getByLabel('First name').fill('Thandi');
    await page.getByLabel('Surname').fill('Mkhize');
    await page.getByLabel('Date of birth').fill('2005-03-14');
    await page.getByLabel('Email address').fill('thandi@example.com');
    await page.getByLabel('Mobile number').fill('0821234567');
    await page.getByLabel('City or town').fill('Pietermaritzburg');
    await page.getByLabel('Suburb').fill('Northdale');
    await page.getByTestId('next-step').click();

    await page.getByLabel('Highest qualification completed').fill('National Senior Certificate');
    await page.getByLabel('School or institution').fill('Northdale Secondary');
    await page.getByLabel('Year completed').fill('2023');
    await page.getByTestId('next-step').click();

    await expect(page.getByLabel('Which pathway?')).toHaveValue('b');
  });
});

test.describe('status lookup', () => {
  test('requires both a reference number and an email address', async ({ page }) => {
    await page.goto('/status');

    await page.getByRole('button', { name: 'Check status' }).click();
    await expect(page.locator('#status-result')).toContainText('the email address you applied with');
  });

  test('never renders documents or personal data on the status page', async ({ page }) => {
    await page.goto('/status');
    const body = (await page.locator('body').innerText()).toLowerCase();

    for (const forbidden of ['id number', 'passport', 'date of birth', 'suburb', 'guardian']) {
      expect(body).not.toContain(forbidden);
    }
  });
});

test.describe('static pages', () => {
  test('privacy notice and terms are clearly placeholders', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.locator('#legal-content')).toContainText('PLACEHOLDER');

    await page.goto('/terms');
    await expect(page.locator('#legal-content')).toContainText('PLACEHOLDER');
  });

  test('the confirmation page asks for a reference when none is given', async ({ page }) => {
    await page.goto('/apply/thank-you');
    await expect(page.locator('#thank-you')).toContainText('Check your reference number');
  });

  test('robots.txt keeps the admin area out of indexes', async ({ request }) => {
    const response = await request.get('/robots.txt');
    const body = await response.text();
    expect(body).toContain('Disallow: /admin');
  });
});
