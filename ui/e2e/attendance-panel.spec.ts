import type { Page, Request } from 'playwright/test';
import { dateInZone } from '../src/format/capture';
import { expect, open, seedSession, test } from './fixtures';

/**
 * The attendance panel's capture states, proved from the occurrence row's own **Import** control
 * (FR-6f/AC-7a, AC-20), never from the `?import=<date>` link. The deep link's own opening is a
 * separate, parked case (`ui/e2e/imports.spec.ts`); nothing here reads a URL parameter, so the
 * matching rule that case is about cannot make these pass or fail.
 *
 * The two fixtures are dated today in UTC, where the event timezone is UTC too, so "live" is computed
 * from the clock rather than stored: `event-live` is an open session with no capture and
 * `event-ended` already carries `ended: true`. Both are opt-in (`gateway.includeActionStates`), because
 * a session dated today would otherwise win another screen's "next occurrence".
 */

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

/**
 * Every non-GET request to the imports family, preflight included, so "sends nothing" covers a
 * submission to any import route and not only the pathname a test happens to upload to.
 */
function watchUploads(page: Page): Request[] {
  const requests: Request[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/gateway/v1/imports') && request.method() !== 'GET') {
      requests.push(request);
    }
  });
  return requests;
}

/** The fixture pair carries one occurrence each, so the body's first row is that occurrence. */
function occurrenceRow(page: Page) {
  return page.getByRole('table', { name: 'Event occurrences' }).getByRole('row').nth(1);
}

test('the occurrence row ends a live session only after the confirmation, then disables the action', async ({
  page,
  gateway,
}) => {
  gateway.includeActionStates = true;
  const uploads = watchUploads(page);
  const today = dateInZone(new Date(), 'UTC');
  await open(page, '/events/event-live');

  await expect(page.getByRole('heading', { level: 1, name: 'Live service' })).toBeVisible();
  const row = occurrenceRow(page);
  // Live is derived, and a session with no capture says so on the row.
  await expect(row.getByText('No capture yet')).toBeVisible();
  await expect(row.getByRole('button', { name: 'End of session' })).toBeEnabled();

  // The panel opens from the row's own control; the state card is the panel's own reading.
  await row.getByRole('button', { name: 'Import' }).click();
  const panel = page.getByRole('dialog', { name: 'Import attendance' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Live', { exact: true })).toBeVisible();
  const end = panel.getByRole('button', { name: 'End of session' });
  await expect(end).toBeEnabled();

  // FR-6f/AC-7a: the click asks first. The dialog names the consequence, and nothing is sent.
  await end.click();
  const confirm = page.getByRole('dialog', { name: 'End this session?' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(/Further captures will be refused/)).toBeVisible();
  expect(uploads).toHaveLength(0);

  // Cancel changes nothing: the panel is still live and the action still offered.
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await expect(panel.getByText('Live', { exact: true })).toBeVisible();
  await expect(end).toBeEnabled();
  expect(uploads).toHaveLength(0);

  // Confirmed: one end-only POST, and the panel stays open on the session it just closed.
  await end.click();
  await page
    .getByRole('dialog', { name: 'End this session?' })
    .getByRole('button', { name: 'End of session' })
    .click();
  await expect.poll(() => uploads.length).toBe(1);
  expect(uploads[0]!.postDataJSON()).toEqual({
    eventId: 'event-live',
    sessionDate: today,
    rows: [],
    ended: true,
  });

  // AC-7a's second half: the page shows "End of session" with the action disabled, not removed.
  await expect(panel.getByText(/End of session · recorded/)).toBeVisible();
  await expect(end).toBeDisabled();
});

test('an ended occurrence shows End of session and offers no further capture', async ({
  page,
  gateway,
}) => {
  gateway.includeActionStates = true;
  const uploads = watchUploads(page);
  await open(page, '/events/event-ended');

  await expect(page.getByRole('heading', { level: 1, name: 'Ended service' })).toBeVisible();
  const row = occurrenceRow(page);

  // The capture is the fixture's own close: the copy names it and the action stays, disabled.
  await expect(row.getByText(/End of session · /)).toBeVisible();
  await expect(row.getByRole('button', { name: 'End of session' })).toBeDisabled();

  // A further capture has nowhere to start: both of the row's capture controls refuse.
  await expect(row.getByRole('button', { name: 'Import' })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'Record headcount' })).toBeDisabled();
  expect(uploads).toHaveLength(0);
});

test('a datetime on another day is refused in the panel before any request leaves it', async ({
  page,
  gateway,
}) => {
  gateway.includeActionStates = true;
  const uploads = watchUploads(page);
  const today = dateInZone(new Date(), 'UTC');
  const otherDay = dateInZone(new Date(Date.now() - 24 * 60 * 60 * 1000), 'UTC');
  await open(page, '/events/event-live');

  await occurrenceRow(page).getByRole('button', { name: 'Import' }).click();
  const panel = page.getByRole('dialog', { name: 'Import attendance' });
  await expect(panel).toBeVisible();

  await panel.getByTestId('import-file').setInputFiles({
    name: 'attendance.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(['memberNo,datetime', `M-1001,${otherDay} 09:05`].join('\n'), 'utf8'),
  });

  // AC-20: the row is reported against the chosen session, and the commit cannot be pressed, so the
  // register is unchanged by construction - the evidence is the absence of a request, not a message.
  await expect(panel.getByText('1 row needs attention')).toBeVisible();
  await expect(
    panel.getByText(`${otherDay} 09:05 is not on the selected session (${today})`, { exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Import 1/ })).toBeDisabled();
  expect(uploads).toHaveLength(0);
});
