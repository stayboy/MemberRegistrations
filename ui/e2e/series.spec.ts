import { expect, open, seedSession, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

/**
 * AC-51/AC-65: the series screens retired with the event-as-parent amendment. A
 * series is the event parent now, so every series route resolves to the event's
 * own route: the list to the events list, new to the event form, the detail to
 * the event detail and the edit form to the event edit form.
 */
test('the retired series list redirects to the events list', async ({ page }) => {
  await open(page, '/events/series');

  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Series' })).toHaveCount(0);
});

test('the retired New series route opens the New event form', async ({ page }) => {
  await open(page, '/events/series/new');

  await expect(page).toHaveURL(/\/events\/new$/);
  await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();
  // The retired Presbyter-only toggle is gone with the series form (FR-42).
  await expect(page.getByRole('switch', { name: 'Presbyter only' })).toHaveCount(0);
});

test('the retired series detail opens the event detail', async ({ page }) => {
  await open(page, '/events/series/series-1');

  await expect(page).toHaveURL(/\/events\/series-1$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday Service' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Event occurrences' })).toBeVisible();
});

test('the retired series edit form opens the event edit form', async ({ page }) => {
  await open(page, '/events/series/series-1/edit');

  await expect(page).toHaveURL(/\/events\/series-1\/edit$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Edit event' })).toBeVisible();
  // FR-42b: the event number is read-only in edit mode and members tracking is not editable.
  await expect(page.getByLabel(/^Event number/)).toHaveAttribute('readonly');
  await expect(page.getByRole('switch', { name: 'Members tracking' })).toBeDisabled();
  await expect(page.getByRole('switch', { name: 'Presbyter only' })).toHaveCount(0);
});
