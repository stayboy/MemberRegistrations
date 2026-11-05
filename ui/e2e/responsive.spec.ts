import { expect, open, seedSession, test } from './fixtures';

const SCREENS = [
  { route: '/members', heading: 'Members', ready: 'table' },
  { route: '/events', heading: 'Events', ready: 'table' },
  { route: '/events/series', heading: 'Series', ready: 'table' },
  { route: '/members/new', heading: 'Add member', ready: 'form' },
  { route: '/members/M-1001', heading: 'Kwame Asante', ready: 'detail' },
  { route: '/events/event-1', heading: 'Sunday Service', ready: 'table' },
  { route: '/events/series/series-1', heading: 'Sunday Service', ready: 'table' },
] as const;

const WIDTHS = [360, 768, 1440] as const;

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

for (const screen of SCREENS) {
  for (const width of WIDTHS) {
    test(`${screen.route} has no horizontal scroll at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, screen.route);

      await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
      if (screen.ready === 'table') {
        await expect(page.getByRole('table').first()).toBeVisible();
      } else if (screen.ready === 'form') {
        await expect(page.getByLabel('Member number')).toBeVisible();
      } else {
        await expect(page.getByRole('tablist', { name: 'Member record sections' })).toBeVisible();
      }

      const metrics = await page.evaluate(() => {
        const content = document.querySelector('#main-content');
        return {
          documentScrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          contentScrollWidth: content?.scrollWidth ?? 0,
          contentClientWidth: content?.clientWidth ?? 0,
        };
      });

      expect(
        metrics.documentScrollWidth,
        `${screen.route} overflows the viewport at ${width} px: ${metrics.documentScrollWidth} > ${metrics.viewportWidth + 1}`,
      ).toBeLessThanOrEqual(metrics.viewportWidth + 1);

      // The shell clips the content column (`overflow-x: hidden`), so a too-wide
      // page would be invisible to the documentElement check alone. Compare the
      // clipped column's own scroll width with its client width.
      expect(
        metrics.contentClientWidth,
        `${screen.route} at ${width} px did not render the content column`,
      ).toBeGreaterThan(0);
      expect(
        metrics.contentScrollWidth,
        `${screen.route} overflows the clipped content column at ${width} px: ${metrics.contentScrollWidth} > ${metrics.contentClientWidth + 1}`,
      ).toBeLessThanOrEqual(metrics.contentClientWidth + 1);
    });
  }
}

test('the mobile navigation is usable at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await open(page, '/members');
  await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();

  await page.getByRole('button', { name: 'Sections' }).click();
  await page.getByRole('menuitem', { name: 'Imports' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Member database' })).toBeVisible();
  await expect(page).toHaveURL(/#\/imports\/members$/);
  await expect(page.getByRole('complementary', { name: 'Imports navigation' })).toBeVisible();
});
