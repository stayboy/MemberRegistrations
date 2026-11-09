import { expect, open, seedSession, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

test('the offerings dashboard shows the four tiles, tabbed breakdown, worklist and USSD footer', async ({
  page,
}) => {
  await open(page, '/events/offerings');

  await expect(page.getByRole('heading', { level: 1, name: 'Offerings' })).toBeVisible();

  // The window defaults to the current UTC year to date.
  const year = await page.evaluate(() => new Date().toISOString().slice(0, 4));
  await expect(page.getByLabel('From')).toHaveValue(`${year}-01-01`);

  // Four tiles: member paid, counted cash, reconciliation and open pledges.
  const totals = page.getByRole('region', { name: 'Offerings totals' });
  await expect(totals.getByText('Member paid')).toBeVisible();
  await expect(totals.getByText('GHS 12,450.00')).toBeVisible();
  await expect(totals.getByText('Visitors GHS 350.00 separate')).toBeVisible();
  await expect(totals.getByText('Counted cash')).toBeVisible();
  await expect(totals.getByText('GHS 12,000.00')).toBeVisible();
  await expect(totals.getByText('Reconciliation')).toBeVisible();
  await expect(totals.getByText(/-GHS\s*800\.00/)).toBeVisible();
  await expect(totals.getByText('Open pledges')).toBeVisible();
  await expect(totals.getByText('GHS 1,800.00')).toBeVisible();

  // The default breakdown tab is by offering; the event and member tabs stay reachable.
  await expect(page.getByRole('table', { name: 'Totals by offering' })).toBeVisible();
  await expect(page.getByText('Share of paid')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Totals by offering' }).getByText('Tithe')).toBeVisible();

  await page.getByRole('tab', { name: 'By event' }).click();
  await expect(page.getByRole('table', { name: 'Totals by event' })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Totals by event' }).getByText('Sunday Service'),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'By member' }).click();
  const members = page.getByRole('table', { name: 'Member totals' });
  await expect(members.getByText('Kwame Asante')).toBeVisible();
  await expect(members.getByText('M-1001')).toBeVisible();
  await expect(members.getByRole('columnheader', { name: 'Follow-up' })).toHaveCount(0);

  // The worklist is five columns with the officer/reminder/reassign in a detail row.
  const worklist = page.getByRole('table', { name: 'Pledge worklist' });
  await expect(worklist.getByText('Kwame Asante').first()).toBeVisible();
  await expect(worklist.getByText('Tithe').first()).toBeVisible();
  await expect(worklist.getByText('Ama Mensah').first()).toBeVisible();
  await expect(page.getByText('This window: 1 honored · 0 dishonored')).toBeVisible();
  await page.getByRole('button', { name: 'Show details for Kwame Asante' }).first().click();
  await expect(page.getByText('Next reminder')).toBeVisible();
  await expect(page.getByLabel('New officer member no')).toBeVisible();
  await expect(page.getByText('Ama Mensah').last()).toBeVisible();

  // USSD footer: shortcode, session, five offerings and 0 More, preview only.
  const preview = page.getByRole('region', { name: 'USSD preview' });
  await expect(preview.getByText('USSD · upcoming')).toBeVisible();
  await expect(preview.getByText('*714*88#')).toBeVisible();
  await expect(preview.getByText(/Foundation service/)).toBeVisible();
  await expect(preview.getByText(/1 Tithe/)).toBeVisible();
  await expect(preview.getByText(/0 More/)).toBeVisible();
  await expect(preview.getByText('Welfare appeal')).toHaveCount(0);
  await expect(preview.getByText('Preview only; no USSD session is opened.')).toBeVisible();

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

test('the worklist reassigns a pledge through the detail row and the reason dialog', async ({
  page,
}) => {
  await open(page, '/events/offerings');

  await page.getByRole('button', { name: 'Show details for Kwame Asante' }).first().click();
  await page.getByLabel('New officer member no').fill('M-9002');
  await page.getByRole('button', { name: 'Reassign pledge for Kwame Asante' }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText("Reassign Kwame Asante's pledge to M-9002")).toBeVisible();
  await dialog.getByLabel('Reason').fill('Moved the follow-up to the assigned shepherd');
  await dialog.getByRole('button', { name: 'Reassign pledge' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  // The list refetches and the expanded row carries the new officer.
  await expect(page.getByText('M-9002').first()).toBeVisible();
});
