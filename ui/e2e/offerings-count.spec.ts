import type { Page } from 'playwright/test';
import { expect, open, openActions, seedSession, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

async function chooseFoundationService(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: 'Event' }).click();
  await page.getByRole('option', { name: /Foundation service/ }).click();
}

test('the offerings count page reads the current observation, records a grid count and corrects it', async ({
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

  // The count entry is a single-pass grid: one input per configured denomination.
  await openActions(page);
  await page.getByRole('menuitem', { name: 'Record count' }).click();
  const recordDialog = page.getByRole('dialog');
  await expect(recordDialog.getByRole('heading', { name: 'Record offering count' })).toBeVisible();
  await expect(recordDialog.getByLabel('Pieces of GHS 200.00')).toHaveValue('');
  await recordDialog.getByLabel('Pieces of GHS 200.00').fill('3');
  await recordDialog.getByLabel('Pieces of GHS 50.00').fill('4');
  await expect(
    recordDialog.getByText('2 of 12 denominations counted; the blank rows stay visible.'),
  ).toBeVisible();
  await expect(recordDialog.getByText('Live total GHS 800.00')).toBeVisible();

  // The fixture session is 2999-01-10; a new count keeps its asOf on that day.
  await recordDialog.getByLabel('As of').fill('2999-01-10T09:30');
  await recordDialog.getByRole('button', { name: 'Record count' }).click();

  await expect(page.getByText('Offering count recorded.')).toBeVisible();
  await expect(page.getByText('GHS 800.00').first()).toBeVisible();
  const currentAsOf = (
    await page
      .getByText(/^as of /)
      .first()
      .innerText()
  ).replace(/^as of /, '');

  // Correct the newly recorded current observation: the grid prefills and asOf is kept.
  await page.getByRole('button', { name: 'Correct' }).first().click();
  const correctDialog = page.getByRole('dialog');
  await expect(
    correctDialog.getByRole('heading', { name: 'Correct offering count' }),
  ).toBeVisible();
  await expect(
    correctDialog.getByText(`Keeping asOf ${currentAsOf}`, { exact: false }).first(),
  ).toBeVisible();
  await expect(correctDialog.getByLabel('Pieces of GHS 200.00')).toHaveValue('3');
  await expect(correctDialog.getByLabel('Pieces of GHS 50.00')).toHaveValue('4');
  await correctDialog.getByLabel('Pieces of GHS 200.00').fill('4');
  await expect(correctDialog.getByText('Live total GHS 1,000.00')).toBeVisible();
  await correctDialog.getByRole('button', { name: 'Save correction' }).click();

  await expect(
    page.getByText('Correction saved. The earlier observation stays readable', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('GHS 1,000.00').first()).toBeVisible();
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
  await expect(giftDialog.getByRole('combobox', { name: 'Member' })).toBeVisible();
  await expect(giftDialog.getByLabel('Session date')).toHaveValue('2999-01-10');
  // The member is picked, not typed: search by number, then choose the option.
  const giftMember = giftDialog.getByRole('combobox', { name: 'Member' });
  await giftMember.click();
  await giftMember.fill('M-1002');
  // Fluent renders the option list in a portal at body level, not inside the dialog.
  await page.getByRole('option', { name: /M-1002/ }).click();
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
  await expect(pledgeDialog.getByRole('combobox', { name: 'Follow-up officer' })).toBeVisible();

  // FR-26a: picking the member shows who the API will record when the officer is left empty. The
  // fixture gives M-1002 an active presbyter shepherd, so the officer stays optional.
  const pledgeMember = pledgeDialog.getByRole('combobox', { name: 'Member' });
  await pledgeMember.click();
  await pledgeMember.fill('M-1002');
  await page.getByRole('option', { name: /M-1002/ }).click();
  await expect(
    pledgeDialog.getByText(/Shepherd M-1001 · Kwame Asante \(Male, 41y\) is this member's active/),
  ).toBeVisible();
  await expect(pledgeDialog.getByText('Optional', { exact: true })).toBeVisible();
  await expect(pledgeDialog.getByRole('combobox', { name: 'Follow-up officer' })).toBeEnabled();
  await expect(pledgeDialog.getByText('Required', { exact: true })).toHaveCount(0);

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
