import type { Page } from 'playwright/test';
import { expect, open, seedSession, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

async function chooseFoundationService(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: 'Event' }).click();
  await page.getByRole('option', { name: /Foundation service/ }).click();
}

/** Chooses an event by its option label; the picker auto-selects its default session. */
async function chooseEvent(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('combobox', { name: 'Event' }).click();
  await page.getByRole('option', { name }).click();
}

test('the headcount page is read-first and records and corrects through dialogs', async ({
  page,
}) => {
  await open(page, '/ussd/headcount');
  await expect(page.getByRole('heading', { level: 1, name: 'USSD headcount' })).toBeVisible();
  await expect(page.getByText('USSD is not live in this production build.')).toBeVisible();

  await chooseFoundationService(page);

  // Read-first: no inline write form; Record is a header action.
  await expect(page.getByRole('region', { name: 'Record a headcount' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Record headcount' })).toBeVisible();

  await expect(page.getByText('Current headcount')).toBeVisible();
  await expect(page.getByText('Roster', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Register-derived attendance. Never merged with the headcount.'),
  ).toBeVisible();
  // The fixture session is dated 2999: not live, so End of session is not offered.
  await expect(page.getByRole('button', { name: 'End of session' })).toHaveCount(0);
  // HC-ACTION-02/03/04: the not-started state line, and neither of the other two labels. The
  // "starts with Live" pattern covers the label only — the hint below it is prose, not a label.
  await expect(page.getByText(/^Not started [·—] this capture will end it$/)).toBeVisible();
  await expect(page.getByText(/^Live(?: · recorded .*)?$/)).toHaveCount(0);
  await expect(page.getByText(/^Past session(?: · .*)?$/)).toHaveCount(0);
  await expect(page.getByText('142', { exact: true }).first()).toBeVisible();

  const history = page.getByRole('table', { name: 'Headcount observations' });
  await expect(history.getByText('Current')).toBeVisible();
  await expect(history.getByText('Superseded')).toBeVisible();
  await expect(history.getByText('Valid for Jan 10, 2999, 09:02 AM')).toBeVisible();

  // Record through the dialog; the live total follows the numbers.
  await page.getByRole('button', { name: 'Record headcount' }).click();
  const recordDialog = page.getByRole('dialog');
  await expect(recordDialog.getByRole('heading', { name: 'Record a headcount' })).toBeVisible();
  await recordDialog.getByLabel('As of').fill('2999-01-10T10:15');
  await recordDialog.getByLabel('Adult men').fill('20');
  await recordDialog.getByLabel('Adult women').fill('10');
  await recordDialog.getByLabel('Children', { exact: true }).fill('5');
  await expect(recordDialog.getByText('Total 35')).toBeVisible();
  await recordDialog.getByRole('button', { name: 'Record headcount' }).click();

  await expect(page.getByText('Headcount recorded.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('35', { exact: true }).first()).toBeVisible();

  // Correct the current observation; the asOf is kept and cannot be edited.
  await page.getByRole('button', { name: 'Correct' }).first().click();
  const correctDialog = page.getByRole('dialog');
  await expect(
    correctDialog.getByRole('heading', { name: 'Correct the current observation' }),
  ).toBeVisible();
  await expect(correctDialog.getByText('Keeping asOf Jan 10, 2999, 10:15 AM')).toBeVisible();
  await expect(correctDialog.getByLabel('As of')).toHaveCount(0);
  await correctDialog.getByLabel('Adult men').fill('21');
  await expect(correctDialog.getByText('Total 36')).toBeVisible();
  await correctDialog.getByRole('button', { name: 'Save correction' }).click();

  await expect(
    page.getByText('Correction saved. The earlier observation stays readable', { exact: false }),
  ).toBeVisible();
  await expect(history.getByText('Valid for Jan 10, 2999, 10:15 AM')).toBeVisible();
  await expect(history.getByText('36', { exact: true })).toBeVisible();

  // The current history row is the second Correct entry point.
  await history.getByRole('button', { name: 'Correct' }).click();
  const rowDialog = page.getByRole('dialog');
  await expect(
    rowDialog.getByRole('heading', { name: 'Correct the current observation' }),
  ).toBeVisible();
  await expect(rowDialog.getByText('Keeping asOf Jan 10, 2999, 10:15 AM')).toBeVisible();
  await rowDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a live session offers an enabled End of session action', async ({ page, gateway }) => {
  gateway.includeActionStates = true;
  await open(page, '/ussd/headcount');
  await chooseEvent(page, /Live service/);

  // Live is computed, never stored: the session is dated today in the event zone with the clock
  // inside its window, so the action is offered and enabled.
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  const endAction = page.getByRole('button', { name: 'End of session' });
  await expect(endAction).toBeVisible();
  await expect(endAction).toBeEnabled();
});

test('an ended session shows End of session disabled, not absent', async ({ page, gateway }) => {
  gateway.includeActionStates = true;
  await open(page, '/ussd/headcount');
  await chooseEvent(page, /Ended service/);

  // An ended capture wins over the window: the action stays visible and is disabled.
  await expect(page.getByText(/^End of session .*recorded 10:00$/)).toBeVisible();
  const endAction = page.getByRole('button', { name: 'End of session' });
  await expect(endAction).toBeVisible();
  await expect(endAction).toBeDisabled();
});
