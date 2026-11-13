import { expect, open, openActions, seedSession, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

test('the series list shows the schedule and the next occurrence', async ({ page }) => {
  await open(page, '/events/series');

  const table = page.getByRole('table', { name: 'Series' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('link', { name: 'Sunday Service' })).toBeVisible();
  await expect(table.getByRole('link', { name: 'Bible Study' })).toBeVisible();

  const sunday = table.getByRole('row').filter({ hasText: 'Sunday Service' });
  await expect(sunday.getByText('Weekly on Sunday')).toBeVisible();
  await expect(sunday.getByText('FREQ=WEEKLY;BYDAY=SU')).toBeVisible();
  // The next occurrence is the first date the API returned for the window.
  await expect(sunday.getByText('Jan 4, 2026', { exact: true })).toBeVisible();
  await expect(sunday.getByText('2 cancelled · 0 extra')).toBeVisible();

  const bibleStudy = table.getByRole('row').filter({ hasText: 'Bible Study' });
  await expect(bibleStudy.getByText('Monthly on day 15')).toBeVisible();
  await expect(bibleStudy.getByText('Jan 15, 2026', { exact: true })).toBeVisible();
  await expect(bibleStudy.getByText('None')).toBeVisible();
});

test('the series detail shows versions, exceptions and the occurrence window', async ({ page }) => {
  await open(page, '/events/series');
  await page.getByRole('link', { name: 'Sunday Service' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Sunday Service' })).toBeVisible();

  const versions = page.getByRole('table', { name: 'Schedule versions' });
  await expect(versions).toBeVisible();
  // Two append-only versions plus the header row.
  await expect(versions.getByRole('row')).toHaveCount(3);
  await expect(versions.getByText('Weekly on Sunday')).toHaveCount(2);
  await expect(versions.getByText('Jan 5, 2025', { exact: true })).toBeVisible();
  await expect(versions.getByText('Jan 4, 2026', { exact: true })).toBeVisible();
  await expect(versions.getByText('Dec 27, 2026', { exact: true })).toBeVisible();

  const exceptions = page.getByRole('table', { name: 'Series exceptions' });
  await expect(exceptions.getByText('Cancelled')).toHaveCount(2);
  await expect(exceptions.getByText('Public holiday')).toBeVisible();
  // A legacy cancellation carries no reason; the table says so rather than a dash.
  await expect(exceptions.getByText('No reason recorded')).toBeVisible();

  await expect(page.getByRole('group', { name: 'Series occurrence window' })).toBeVisible();
  const occurrences = page.getByRole('table', { name: 'Series occurrences' });
  await expect(occurrences).toBeVisible();
  await expect(occurrences.getByRole('row')).toHaveCount(4); // header plus three dates
  await expect(occurrences.getByRole('link', { name: 'View events' })).toHaveCount(3);
  await expect(occurrences.getByText('Jan 18, 2026', { exact: true })).toBeVisible();

  // FR-6e: one summary request feeds three tiles; the Occurrences tile counts the
  // same list the table renders, so it always agrees with the rows beneath it.
  const summary = page.getByRole('region', { name: 'Series summary' });
  await expect(summary).toBeVisible();
  await expect(summary.getByText('Next occurrence')).toBeVisible();
  await expect(summary.getByText('Jan 4, 2026', { exact: true })).toBeVisible();
  await expect(summary.getByText('Occurrences')).toBeVisible();
  await expect(summary.getByText('in this window')).toBeVisible();
  await expect(summary.getByText('75%')).toBeVisible();
  await expect(summary.getByText('3 of 4 on Jan 25, 2026')).toBeVisible();
  await expect(summary.getByText('2', { exact: true })).toBeVisible();
  await expect(summary.getByText('paid this window')).toBeVisible();
});

test('the series entry opens the import flow filtered to the series', async ({ page }) => {
  await open(page, '/events/series');
  await page.getByRole('link', { name: 'Sunday Service' }).click();

  await openActions(page);
  const entry = page.getByRole('menuitem', { name: 'Import attendance' });
  await expect(entry).toBeVisible();
  await entry.click();

  await expect(page).toHaveURL(/\/imports\/attendance\?series=series-1/);

  // The picker lists only series-backed events, so the standalone retreat is absent.
  await page.getByRole('combobox', { name: 'Event' }).click();
  await expect(page.getByRole('option', { name: /Sunday Service/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Leaders retreat/ })).toHaveCount(0);
});
