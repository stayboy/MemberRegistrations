import { expect, open, seedSession, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

test('the offerings landing shows member cards, totals, worklist and the USSD preview', async ({
  page,
}) => {
  await open(page, '/events/offerings');

  await expect(page.getByRole('heading', { level: 1, name: 'Offerings' })).toBeVisible();

  // The window defaults to the current UTC year to date.
  const year = await page.evaluate(() => new Date().toISOString().slice(0, 4));
  await expect(page.getByLabel('From')).toHaveValue(`${year}-01-01`);

  // Member-only money cards plus the separate Visitors card.
  const totals = page.getByRole('region', { name: 'Offerings totals' });
  await expect(totals.getByText('Member giving')).toBeVisible();
  await expect(totals.getByText('GHS 12,450.00')).toBeVisible();
  await expect(totals.getByText('GHS 4,800.00')).toBeVisible();
  await expect(totals.getByText('GHS 1,800.00')).toBeVisible();
  await expect(totals.getByText('Visitors')).toBeVisible();
  await expect(totals.getByText('GHS 350.00')).toBeVisible();

  // By-member is the top 10 by paid with no Follow-up column.
  const members = page.getByRole('table', { name: 'Member totals' });
  await expect(members.getByText('Kwame Asante')).toBeVisible();
  await expect(members.getByText('M-1001')).toBeVisible();
  await expect(members.getByRole('columnheader', { name: 'Follow-up' })).toHaveCount(0);

  // By-offering and by-event totals come from summary.offerings/events.
  await expect(page.getByRole('table', { name: 'Totals by offering' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Totals by event' })).toBeVisible();

  // The worklist is unwindowed, newest first, with names and next reminder.
  const worklist = page.getByRole('table', { name: 'Pledge worklist' });
  await expect(worklist.getByText('Kwame Asante').first()).toBeVisible();
  await expect(worklist.getByText('Tithe').first()).toBeVisible();
  await expect(worklist.getByText('Ama Mensah').first()).toBeVisible();
  await expect(worklist.getByRole('columnheader', { name: 'Next reminder' })).toBeVisible();

  // USSD preview: the current/next event, five offerings and 0 More.
  const preview = page.getByRole('region', { name: 'USSD preview' });
  await expect(preview.getByText('Foundation service')).toBeVisible();
  await expect(preview.getByText('1 Tithe')).toBeVisible();
  await expect(preview.getByText('5 Youth appeal')).toBeVisible();
  await expect(preview.locator('pre')).toContainText('0 More');
  await expect(preview.getByText('Welfare appeal')).toHaveCount(0);

  // FR-29 stats stay zeroed and are never rendered here (R8).
  await expect(page.getByText('Honor rate')).toHaveCount(0);
  await expect(page.getByText('Contribution count')).toHaveCount(0);

  // No contact values anywhere on the landing (FR-40).
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/@/);
  expect(text).not.toContain('+233');
});

test('the terms dialog renders the newest version and the gateway payload', async ({ page }) => {
  await open(page, '/events/offerings');

  await page.getByRole('button', { name: 'View terms' }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Terms of reference · Tithe' })).toBeVisible();
  await expect(dialog.getByText('Version')).toBeVisible();
  await expect(dialog.getByText('2', { exact: true })).toBeVisible();
  await expect(dialog.getByText('MR-GATEWAY-001')).toBeVisible();
  await expect(dialog.getByText('merchant')).toBeVisible();
  await expect(dialog.getByText('MR-001')).toBeVisible();

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the worklist reassigns a pledge through the reason dialog', async ({ page }) => {
  await open(page, '/events/offerings');

  await page.getByLabel('Reassign to (officer member no)').fill('M-9002');
  await page.getByRole('button', { name: 'Reassign pledge for Kwame Asante' }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText("Reassign Kwame Asante's pledge to M-9002")).toBeVisible();
  await dialog.getByLabel('Reason').fill('Moved the follow-up to the assigned shepherd');
  await dialog.getByRole('button', { name: 'Reassign pledge' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  // The list refetches and the row carries the new officer resolved name.
  const worklist = page.getByRole('table', { name: 'Pledge worklist' });
  await expect(worklist.getByText('M-9002').first()).toBeVisible();
});
