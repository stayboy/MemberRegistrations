import AxeBuilder from '@axe-core/playwright';
import type { Page } from 'playwright/test';
import type { AccentId, Scheme } from '../src/theme/brand';
import { expect, open, seedSession, seedTheme, test } from './fixtures';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * The `--colorBrandBackground` each seeded theme must resolve to. Fluent maps
 * this token to ramp stop 80 in the light theme and stop 70 in the dark theme,
 * so the map also proves that accent and scheme both reached the page.
 */
const EXPECTED_BRAND_BACKGROUND: Record<AccentId, Record<Scheme, string>> = {
  fluent: { light: '#0f6cbd', dark: '#115ea3' },
  ocean: { light: '#006994', dark: '#005e85' },
  meadow: { light: '#1c7b37', dark: '#196c30' },
  plum: { light: '#9c1c89', dark: '#891878' },
};

/**
 * A wrong or ignored `seedTheme` must fail here, never silently audit Fluent
 * four times: the scheme marker and the resolved brand token are both checked.
 */
async function expectSeededTheme(page: Page, accent: AccentId, scheme: Scheme): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-scheme', scheme);

  const brandBackground = await page.evaluate(() => {
    const provider = document.querySelector('.fui-FluentProvider');
    return provider ? getComputedStyle(provider).getPropertyValue('--colorBrandBackground') : '';
  });

  expect(
    brandBackground.trim().toLowerCase(),
    `the ${accent}/${scheme} theme did not reach the page`,
  ).toBe(EXPECTED_BRAND_BACKGROUND[accent][scheme]);
}

/**
 * A failure names every violating rule, its impact and the failing target, so a
 * red run is actionable without opening the HTML report.
 */
async function audit(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    // Tabster (used by Fluent Provider) inserts invisible focus sentinels with
    // `tabindex="0" aria-hidden="true"`; they are library internals, not app
    // markup, so they are removed from the audit scope rather than rule-disabled.
    .exclude('[data-tabster-dummy]')
    .withTags(AXE_TAGS)
    .analyze();

  const summary = results.violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(' ')).join(' | ');
      return `${violation.id} (${violation.impact ?? 'unknown'}) → ${targets}`;
    })
    .join('\n');

  expect(results.violations, `${label} accessibility violations:\n${summary}`).toEqual([]);
}

const SCREENS = [
  { route: '/members', label: 'members', heading: 'Members' },
  { route: '/events', label: 'events', heading: 'Events' },
  { route: '/events/event-1', label: 'event detail', heading: 'Sunday Service' },
] as const;

test.describe('accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page);
  });

  for (const screen of SCREENS) {
    test(`${screen.label} passes WCAG 2.2 AA in light mode`, async ({ page }) => {
      await seedTheme(page, 'fluent', 'light');
      await open(page, screen.route);
      await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
      await expect(page.getByRole('table').first()).toBeVisible();
      await expectSeededTheme(page, 'fluent', 'light');
      await audit(page, `${screen.label} (light)`);
    });

    test(`${screen.label} passes WCAG 2.2 AA in dark mode`, async ({ page }) => {
      await seedTheme(page, 'fluent', 'dark');
      await open(page, screen.route);
      await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
      await expect(page.getByRole('table').first()).toBeVisible();
      await expectSeededTheme(page, 'fluent', 'dark');
      await audit(page, `${screen.label} (dark)`);
    });
  }

  for (const accent of ['fluent', 'ocean', 'meadow', 'plum'] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`the shell at 1440 px passes WCAG 2.2 AA with the ${accent} accent in ${scheme} mode`, async ({
        page,
      }) => {
        await seedTheme(page, accent, scheme);
        await open(page, '/members');
        await expect(page.getByRole('table', { name: 'Members' })).toBeVisible();
        await expectSeededTheme(page, accent, scheme);
        await audit(page, `shell (${accent} accent, ${scheme})`);
      });
    }
  }
});
