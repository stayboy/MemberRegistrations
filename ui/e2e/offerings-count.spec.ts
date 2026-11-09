import type { Page } from 'playwright/test';
import { expect, open, seedSession, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

async function chooseFoundationService(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: 'Event' }).click();
  await page.getByRole('option', { name: /Foundation service/ }).click();
}

test('the offerings count page reads the current observation and records a correction', async ({
  page,
}) => {
  await open(page, '/ussd/offerings');
  await expect(page.getByRole('heading', { level: 1, name: 'Offerings count' })).toBeVisible();
  await expect(page.getByText('USSD is not live in this production build.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Simulator' })).toHaveCount(0);

  await chooseFoundationService(page);

  // The event's first active attachment is selected and its group loads.
  await expect(page.getByRole('combobox', { name: 'Offering to count' })).toContainText('Tithe');
  await expect(page.getByText('Current counted cash')).toBeVisible();
  await expect(page.getByText('GHS 1,200.00').first()).toBeVisible();
  await expect(page.getByText(/^as of /)).toBeVisible();

  // The append-only history shows the superseded row and the current row.
  const history = page.getByRole('table', { name: 'Offering count observations' });
  await expect(history.getByText('Current')).toBeVisible();
  await expect(history.getByText('Superseded')).toBeVisible();
  await expect(history.getByText('GHS 780.00')).toBeVisible();

  // The count entry is a dialog; the GHS quick-pick adds a row and the live total follows.
  await page.getByRole('button', { name: 'Record count' }).click();
  const recordDialog = page.getByRole('dialog');
  await expect(recordDialog.getByRole('heading', { name: 'Record offering count' })).toBeVisible();
  await recordDialog.getByRole('button', { name: 'GHS 20.00' }).click();
  const rows = recordDialog.getByRole('table', { name: 'Denomination rows' });
  await expect(rows.getByLabel('Pieces of GHS 20.00')).toHaveValue('1');
  await expect(recordDialog.getByText('Live total GHS 20.00')).toBeVisible();
  await recordDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Correct the current observation: the lines prefill and asOf is kept.
  await page.getByRole('button', { name: 'Correct' }).first().click();
  const correctDialog = page.getByRole('dialog');
  await expect(correctDialog.getByRole('heading', { name: 'Correct offering count' })).toBeVisible();
  await expect(correctDialog.getByText(/Keeping asOf/)).toBeVisible();
  const correctionRows = correctDialog.getByRole('table', { name: 'Denomination rows' });
  await expect(correctionRows.getByLabel('Pieces of GHS 20.00')).toHaveValue('40');
  await correctionRows.getByLabel('Pieces of GHS 20.00').fill('41');
  await expect(correctDialog.getByText('Live total GHS 1,220.00')).toBeVisible();
  await correctDialog.getByRole('button', { name: 'Save correction' }).click();

  await expect(
    page.getByText('Correction saved. The earlier observation stays readable', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('GHS 1,220.00').first()).toBeVisible();
});

test('the page lists the session offertories and opens the record and pledge dialogs', async ({
  page,
}) => {
  await open(page, '/ussd/offerings');
  await chooseFoundationService(page);

  // The session offertories list is collapsed by default and reads the seeded row.
  const offertories = page.getByRole('region', { name: 'Recorded offertories this session' });
  await expect(offertories.getByText('Recorded this session')).toBeVisible();
  await expect(offertories.getByText('M-1001')).toHaveCount(0);
  await offertories.getByRole('button', { name: 'Show' }).click();
  const offertoryTable = page.getByRole('table', { name: 'Recorded offertories this session' });
  await expect(offertoryTable.getByText('M-1001')).toBeVisible();
  await expect(offertoryTable.getByText('Tithe')).toBeVisible();
  await expect(offertoryTable.getByText('GHS 500.00')).toBeVisible();
  await expect(offertories.getByText('View all in Offerings')).toBeVisible();

  // Record an announced offertory through the dialog; the list refetches.
  await offertories.getByRole('button', { name: 'Record offertory' }).click();
  const giftDialog = page.getByRole('dialog');
  await expect(
    giftDialog.getByRole('heading', { name: 'Record announced offertory' }),
  ).toBeVisible();
  await expect(giftDialog.getByLabel('Member number')).toBeVisible();
  await expect(giftDialog.getByLabel('Session date')).toHaveValue('2999-01-10');
  await giftDialog.getByLabel('Member number').fill('M-1002');
  await giftDialog.getByLabel('Amount').fill('75.00');
  await giftDialog.getByRole('button', { name: 'Record offertory' }).click();
  await expect(giftDialog.getByText(/Announced offertory recorded/)).toBeVisible();
  await giftDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(offertoryTable.getByText('M-1002')).toBeVisible();
  await expect(offertoryTable.getByText('GHS 75.00')).toBeVisible();

  // The compact Pledges panel records through its own dialog and links to the worklist.
  const pledgePanel = page.getByRole('region', { name: 'Record a pledge' });
  await expect(pledgePanel.getByText('Offerings pledge worklist')).toBeVisible();
  await pledgePanel.getByRole('button', { name: 'Record pledge' }).click();
  const pledgeDialog = page.getByRole('dialog');
  await expect(pledgeDialog.getByRole('heading', { name: 'Record pledge' })).toBeVisible();
  await expect(pledgeDialog.getByLabel('Expected on')).toBeVisible();
  await expect(pledgeDialog.getByLabel('Follow-up officer member no')).toBeVisible();
  await pledgeDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Terms are one click away; the dialog is the existing terms route.
  await page.getByRole('button', { name: 'View terms' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/@/);
  expect(text).not.toContain('+233');
});
