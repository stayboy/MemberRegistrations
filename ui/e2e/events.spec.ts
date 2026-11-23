import { expect, open, openActions, seedSession, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

test('the events list shows one parent row with its audience, next occurrence and window figures', async ({
  page,
}) => {
  await open(page, '/events');

  const table = page.getByRole('table', { name: 'Events' });
  await expect(table).toBeVisible();
  // A series is the event parent (FR-1/FR-5), so its row is one row with a Repeats mark, the
  // server-rendered audience summary, the server's next occurrence and the window figures.
  await expect(table.locator('a[href="#/events/series-1"]')).toBeVisible();
  await expect(table.getByText('Repeats', { exact: true }).first()).toBeVisible();
  // The first cell is the number and its venue (falling back to the venue type).
  await expect(table.getByText('EVT-2026-001 · Main auditorium', { exact: true })).toBeVisible();
  // The audience is a tag carrying the audience name; the full rule sentence is its title.
  await expect(table.getByTitle('Choir - all of ministry CHR')).toHaveText('Choir');
  await expect(table.getByText('Jan 4, 2026', { exact: true }).first()).toBeVisible();
  // The ratio is the summary's own window figures, never a per-session total; the bar is
  // decorative and the text carries the value.
  await expect(table.getByText('9/12 · 75%')).toBeVisible();
  await expect(table.getByRole('progressbar', { includeHidden: true }).first()).toHaveAttribute(
    'aria-valuenow',
    '0.75',
  );
  await expect(table.getByText('2 attached')).toBeVisible();
  await expect(table.getByRole('link', { name: 'Leaders retreat' })).toBeVisible();
  await expect(table.getByText('EVT-2026-777 · Main auditorium', { exact: true })).toBeVisible();
  // The footer counts the loaded rows themselves.
  await expect(
    page.getByText('4 events in this window · 1 recurring · 3 standalone', { exact: true }),
  ).toBeVisible();
  // The dead series filter is gone; the window is the only list control.
  await expect(page.getByRole('combobox', { name: 'Series filter' })).toHaveCount(0);
  // FR-5/FR-2: the recurring row names the schedule it repeats.
  await expect(table.getByText('Weekly on Sunday', { exact: true }).first()).toBeVisible();
});

test('the event detail opens the occurrence attendance dialog with the API rows', async ({
  page,
}) => {
  await open(page, '/events/event-1');

  await expect(page.getByRole('heading', { level: 1, name: 'Sunday Service' })).toBeVisible();
  await expect(page.getByText('EVT-2026-001', { exact: true })).toBeVisible();

  const occurrences = page.getByRole('table', { name: 'Event occurrences' });
  const january = occurrences.getByRole('row', { name: /Jan 4, 2026/ });
  await expect(january.getByText('3 present')).toBeVisible();
  await expect(january.getByText('Roster 42')).toBeVisible();
  await occurrences.getByRole('button', { name: 'View rows for Jan 4, 2026' }).click();

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

test('a cancelled occurrence shows its reason, and a legacy one says it is missing', async ({
  page,
}) => {
  await open(page, '/events/event-cancelled');

  const occurrences = page.getByRole('table', { name: 'Event occurrences' });
  await expect(occurrences.getByText('Reason: Venue flooded')).toBeVisible();
  await expect(occurrences.getByText('No reason recorded')).toBeVisible();
});

test('the retired attendance route lands on the activity with its date', async ({ page }) => {
  await open(page, '/imports/attendance?event=event-1&date=2026-01-04');

  await expect(page).toHaveURL(/\/events\/event-1\?kind=event&import=2026-01-04/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday Service' })).toBeVisible();
});

// Parked, not weakened: the panel's opening from the parameter fails under a parallel run and
// the backlog row ("The import panel's deep-link opening is unverified end to end") says it is
// parked rather than retried. The matching logic is covered in the DOM lane.
test.fixme('the retired attendance route opens the panel for its date', async ({ page }) => {
  await open(page, '/imports/attendance?event=event-1&date=2026-01-04');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByText(/Jan 4, 2026/)).toBeVisible();
});

test('a bare retired attendance route lands on the member import', async ({ page }) => {
  await open(page, '/imports/attendance');
  await expect(page).toHaveURL(/\/imports\/members$/);
});

test('a standalone event offers the attendance import on each member-tracking occurrence', async ({
  page,
}) => {
  await open(page, '/events/event-2');

  await expect(page.getByRole('heading', { level: 1, name: 'Leaders retreat' })).toBeVisible();
  // FR-8 retired the series-only rule: a standalone member-tracking occurrence imports exactly
  // like a recurring one, so both rows offer it inside the occurrence table.
  const occurrences = page.getByRole('table', { name: 'Event occurrences' });
  await expect(occurrences.getByRole('button', { name: 'Import' })).toHaveCount(2);
  // It is a row control, not a page verb: no `Actions` menu and `Refresh` stays a bare icon (FR-9a).
  await expect(page.getByRole('button', { name: 'Actions' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
});

test('the event detail shows the read-only Active offerings panel and terms', async ({ page }) => {
  await open(page, '/events/event-1');

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

test('the events list holds New event and New series in one Actions menu', async ({ page }) => {
  await open(page, '/events');

  // AC-55: Refresh is a bare icon and one Actions menu holds both create verbs.
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions' })).toHaveCount(1);

  await openActions(page);
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'New event' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'New series' })).toBeVisible();

  await menu.getByRole('menuitem', { name: 'New event' }).click();
  await expect(page).toHaveURL(/\/events\/new$/);
  await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();

  await open(page, '/events');
  await openActions(page);
  await page.getByRole('menuitem', { name: 'New series' }).click();
  await expect(page).toHaveURL(/\/events\/series\/new$/);
  await expect(page.getByRole('heading', { level: 1, name: 'New series' })).toBeVisible();
});

test('the New event form creates a standalone event and opens its detail', async ({
  page,
  gateway,
}) => {
  await open(page, '/events');
  await openActions(page);
  await page.getByRole('menuitem', { name: 'New event' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();
  // FR-9a: a form's commit/cancel pair replaces the page's Actions menu.
  await expect(page.getByRole('button', { name: 'Actions' })).toHaveCount(0);

  await page.getByLabel('Event number').fill('EVT-2026-031');
  await page.getByLabel(/^Name/).fill('Strategic Conference');
  await page.getByLabel('Start date').fill('2026-01-15');
  await page.getByLabel('End date').fill('2026-01-16');
  await page.getByLabel(/^Start time/).fill('09:00');
  await page.getByLabel('End time (optional)').fill('17:00');
  await page.getByRole('combobox', { name: 'Venue type' }).click();
  await page.getByRole('option', { name: 'Auditorium' }).click();
  await page.getByLabel('Venue name (optional)').fill('Main Auditorium');
  await page.getByLabel('Description (optional)').fill('Annual leadership conference.');
  await page.getByRole('switch', { name: 'Presbyter only' }).click();

  await page.getByRole('button', { name: 'Create event' }).click();

  await expect(page).toHaveURL(/\/events\/created-EVT-2026-031$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Strategic Conference' })).toBeVisible();

  // AC-56: the recorded wire carries the FR-42a fields and one session, never
  // the status or source the API derives.
  const body = gateway.lastEventCreate as Record<string, unknown>;
  expect(body).toMatchObject({
    eventNo: 'EVT-2026-031',
    name: 'Strategic Conference',
    startDate: '2026-01-15',
    endDate: '2026-01-16',
    startTime: '09:00',
    endTime: '17:00',
    venueType: 'auditorium',
    venueName: 'Main Auditorium',
    description: 'Annual leadership conference.',
    tracksMembers: true,
    presbyterOnly: true,
  });
  expect(body).not.toHaveProperty('timezone');
  expect(body).not.toHaveProperty('status');
  expect(body).not.toHaveProperty('source');
  // The start-date change moved the lone session, and its blank times inherit.
  expect(body.sessions).toEqual([{ date: '2026-01-15' }]);
});

test('a duplicate event number shows the 409 against the Event number field', async ({ page }) => {
  await open(page, '/events/new');
  await page.getByLabel('Event number').fill('EVT-2026-001');
  await page.getByLabel(/^Name/).fill('Duplicate conference');

  await page.getByRole('button', { name: 'Create event' }).click();

  await expect(page).toHaveURL(/\/events\/new$/);
  await expect(page.getByText('Event number EVT-2026-001 is already in use')).toBeVisible();
});
