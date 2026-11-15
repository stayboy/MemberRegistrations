import { expect, open, seedSession, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

// A series is an activity in the events list, so its own list retires and the route redirects
// (spec 4.3, AC-51). The list's own assertions move to the events list in the round that merges it.
test('the retired series list redirects to the events list', async ({ page }) => {
  await open(page, '/events/series');

  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Series' })).toHaveCount(0);
});

test('the series detail shows versions, exceptions and the occurrence window', async ({ page }) => {
  await open(page, '/events/series-1?kind=series');

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

