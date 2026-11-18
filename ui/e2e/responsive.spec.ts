import { expect, open, seedSession, test } from './fixtures';

const SCREENS = [
  { route: '/members', heading: 'Members', ready: 'table' },
  { route: '/events', heading: 'Events', ready: 'table' },
  { route: '/members/new', heading: 'Person and contact', ready: 'form' },
  { route: '/members/M-1001', heading: 'Kwame Asante (Male, 41y)', ready: 'detail' },
  { route: '/events/event-1', heading: 'Sunday Service', ready: 'table' },
  { route: '/events/series-1?kind=series', heading: 'Sunday Service', ready: 'table' },
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

/**
 * MR-15: below 560 px the identity row stacks. The portrait column sits above
 * the field grid rather than beside it, the grid takes the whole row width, and
 * the square drops to its 96 px mobile size. The no-horizontal-scroll cases
 * above cover the overflow half of the same breakpoint.
 */
test('the member form stacks the photo column above the fields at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await open(page, '/members/new');
  await expect(page.getByLabel('Member number')).toBeVisible();

  const layout = await page.evaluate(() => {
    const column = document.querySelector<HTMLElement>(
      '[data-testid="member-photo-control-column"]',
    );
    const fields = document.querySelector<HTMLElement>('[data-testid="member-identity-fields"]');
    const square = document.querySelector<HTMLElement>(
      '[data-testid="member-photo-control-square"]',
    );
    if (!column || !fields || !square) return null;

    const columnRect = column.getBoundingClientRect();
    const fieldsRect = fields.getBoundingClientRect();
    const squareRect = square.getBoundingClientRect();
    return {
      columnTop: Math.round(columnRect.top),
      columnBottom: Math.round(columnRect.bottom),
      fieldsTop: Math.round(fieldsRect.top),
      fieldsWidth: Math.round(fieldsRect.width),
      rowWidth: Math.round(fields.parentElement?.getBoundingClientRect().width ?? 0),
      squareWidth: Math.round(squareRect.width),
      squareHeight: Math.round(squareRect.height),
    };
  });

  expect(layout, 'the identity row did not render its photo column and fields').not.toBeNull();
  const { columnTop, columnBottom, fieldsTop, fieldsWidth, rowWidth, squareWidth, squareHeight } =
    layout!;

  expect(
    columnTop,
    `the photo column did not start above the grid: ${JSON.stringify(layout)}`,
  ).toBeLessThan(fieldsTop);
  expect(
    columnBottom,
    `the photo column overlaps the grid instead of stacking above it: ${JSON.stringify(layout)}`,
  ).toBeLessThanOrEqual(fieldsTop + 1);
  expect(
    fieldsWidth,
    `the field grid is not full width at 360 px: ${JSON.stringify(layout)}`,
  ).toBeGreaterThanOrEqual(rowWidth - 1);
  expect(squareWidth, `the photo square is not 96 px wide: ${JSON.stringify(layout)}`).toBe(96);
  expect(squareHeight, `the photo square is not 96 px tall: ${JSON.stringify(layout)}`).toBe(96);
});

/**
 * FR-29: the drawing fixes the overview's card row - four across from 1280 px and
 * a 2 x 2 block below it. The auto-fit grid used to fit three tracks at 860 px and
 * stretch `Shepherd calls` tall as its two cells wrapped, so this reads the cards'
 * tops and heights rather than the CSS: two distinct tops prove two rows, and an
 * equal height per row proves no card is stretched.
 */
test('the overview cards wrap to two rows below the desktop breakpoint and stay level', async ({
  page,
}) => {
  const CARD_KEYS = ['attended', 'last-attended', 'shepherd-calls', 'most-attended'] as const;

  const cards = () =>
    page.evaluate((keys) => {
      return keys.flatMap((key) => {
        const element = document.querySelector(`[data-testid="overview-card-${key}"]`);
        if (!element) return [];
        const rect = element.getBoundingClientRect();
        return [{ key, top: Math.round(rect.top), height: rect.height }];
      });
    }, CARD_KEYS);

  await page.setViewportSize({ width: 860, height: 900 });
  await open(page, '/members/M-1001');
  for (const key of CARD_KEYS) {
    await expect(page.getByTestId(`overview-card-${key}`)).toBeVisible();
  }

  const narrow = await cards();
  expect(narrow, 'the overview rendered fewer than four cards').toHaveLength(4);

  const narrowTops = [...new Set(narrow.map((card) => card.top))];
  expect(
    narrowTops,
    `the cards drew ${narrowTops.length} rows at 860 px: ${JSON.stringify(narrow)}`,
  ).toHaveLength(2);

  for (const top of narrowTops) {
    const heights = narrow.filter((card) => card.top === top).map((card) => card.height);
    expect(heights, `the row at ${top} px does not hold two cards`).toHaveLength(2);
    expect(
      Math.max(...heights) - Math.min(...heights),
      `the row at ${top} px is not level: ${JSON.stringify(narrow)}`,
    ).toBeLessThanOrEqual(1);
  }

  const overflow = await page.evaluate(() => {
    const content = document.querySelector('#main-content');
    return { scrollWidth: content?.scrollWidth ?? 0, clientWidth: content?.clientWidth ?? 0 };
  });
  expect(overflow.clientWidth, 'the content column did not render at 860 px').toBeGreaterThan(0);
  expect(
    overflow.scrollWidth,
    `the content column overflows at 860 px: ${overflow.scrollWidth} > ${overflow.clientWidth + 1}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);

  await page.setViewportSize({ width: 1440, height: 900 });
  const wide = await cards();
  const wideTops = [...new Set(wide.map((card) => card.top))];
  expect(
    wideTops,
    `the cards drew ${wideTops.length} rows at 1440 px: ${JSON.stringify(wide)}`,
  ).toHaveLength(1);
});

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
