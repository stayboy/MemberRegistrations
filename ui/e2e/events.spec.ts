import { expect, open, seedSession, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

test('the events list shows the fixture rows', async ({ page }) => {
  await open(page, '/events');

  const table = page.getByRole('table', { name: 'Events' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('link', { name: 'Sunday Service' })).toBeVisible();
  await expect(table.getByRole('link', { name: 'Leaders retreat' })).toBeVisible();
  await expect(table.getByText('EVT-2026-001', { exact: true })).toBeVisible();
  // The date-window list shows the API's per-session counts, never a total.
  await expect(table.getByText('3/42')).toBeVisible();
});

test('the event detail opens the session attendance dialog with the API rows', async ({ page }) => {
  await open(page, '/events');
  await page.getByRole('link', { name: 'Sunday Service' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Sunday Service' })).toBeVisible();
  await expect(page.getByText('EVT-2026-001', { exact: true })).toBeVisible();

  const sessions = page.getByRole('table', { name: 'Event sessions' });
  await expect(sessions.getByText('3/42')).toBeVisible();
  await sessions.getByRole('button', { name: /View rows for/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/^Attendance ·/)).toBeVisible();

  // Counts are the API's fields verbatim: 3 present, 42 expected, 2 imported.
  await expect(dialog.getByText('Present', { exact: true })).toBeVisible();
  await expect(dialog.getByText('3', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Expected', { exact: true })).toBeVisible();
  await expect(dialog.getByText('42', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Imported rows', { exact: true })).toBeVisible();
  await expect(dialog.getByText('2', { exact: true })).toBeVisible();

  const rows = dialog.getByRole('table', { name: 'Attendance rows' }).getByRole('row');
  await expect(rows).toHaveCount(4); // header plus the three API rows
  await expect(dialog.getByText('Kwame Asante (Male, 41y)')).toBeVisible();
  await expect(dialog.getByText('Yaw Owusu (Male, 35y)')).toBeVisible();
  await expect(dialog.getByText('Import', { exact: true })).toHaveCount(2);
  await expect(dialog.getByText('Manual', { exact: true })).toHaveCount(1);

  // No client-derived arithmetic: 42 - 3 is never rendered.
  await expect(dialog.getByText('39', { exact: true })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the event detail shows the read-only Active offerings panel and terms', async ({ page }) => {
  await open(page, '/events');
  await page.getByRole('link', { name: 'Sunday Service' }).click();

  const panel = page.getByRole('region', { name: 'Active offerings' });
  await expect(panel).toBeVisible();
  const table = panel.getByRole('table', { name: 'Active offerings' });
  await expect(table.getByText('Tithe').first()).toBeVisible();
  await expect(table.getByText('Missions').first()).toBeVisible();
  await expect(table.getByText('Building fund')).toBeVisible();
  await expect(table.getByText('Active', { exact: true })).toHaveCount(2);
  await expect(table.getByText('Expired', { exact: true })).toHaveCount(1);
  await expect(table.getByText('v1', { exact: true })).toHaveCount(3);

  await panel.getByRole('button', { name: 'View terms for Tithe' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Terms of reference · Tithe' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
