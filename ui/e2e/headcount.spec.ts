import { expect, open, seedSession, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

// The operator headcount page retired (owner, 2026-11-15): a count is recorded from the activity
// detail's session row, because it needs the event it is counted against. These are the assertions
// that used to live on that page, restated where the behaviour now is.
test('a session row carries the headcount and the action that records it', async ({ page }) => {
  await open(page, '/events/event-1');

  const sessions = page.getByRole('table', { name: 'Event sessions' });
  await expect(sessions.getByRole('columnheader', { name: 'Headcount' })).toBeVisible();
  await expect(sessions.getByRole('button', { name: 'Record headcount' }).first()).toBeVisible();
  // The count is a per-lane reading, never one summed figure (HC-22).
  await expect(sessions.getByText('Not counted').first()).toBeVisible();
});

test('the retired headcount route lands on its activity, or on the list when it names none', async ({
  page,
}) => {
  await open(page, '/ussd/headcount?event=event-1');
  await expect(page).toHaveURL(/\/events\/event-1\?kind=event/);

  await open(page, '/ussd/headcount');
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible();
});
