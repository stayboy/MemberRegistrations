import { expect, open, seedSession, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

// The operator headcount page retired (owner, 2026-11-15): a count is recorded from the activity
// detail's occurrence row, because it needs the event it is counted against. These are the
// assertions that used to live on that page, restated where the behaviour now is.
test('an occurrence row carries the headcount and the action that records it', async ({ page }) => {
  await open(page, '/events/event-1');

  const occurrences = page.getByRole('table', { name: 'Event occurrences' });
  await expect(occurrences.getByRole('columnheader', { name: 'Headcount' })).toBeVisible();
  // HC-22/HC-28: the count is a per-lane reading on the row, never one summed figure.
  await expect(occurrences.getByRole('button', { name: 'Record headcount' }).first()).toBeVisible();
  await expect(occurrences.getByText('Not counted').first()).toBeVisible();
});

test('a recorded count shows its lane and buckets on the occurrence row', async ({ page }) => {
  await open(page, '/events/event-offerings');

  const row = page.getByRole('table', { name: 'Event occurrences' }).getByRole('row').nth(1); // header first, the Foundation service occurrence beneath it
  // HC-28: a lane shows its buckets, not only its total; the lane is the row's own read.
  await expect(row.getByText('Adult service', { exact: true })).toBeVisible();
  await expect(row.getByText('Adult men 62 · Adult women 71 · Children 9')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Correct' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Record headcount' })).toBeVisible();
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
