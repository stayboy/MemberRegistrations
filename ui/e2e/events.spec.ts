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

test('the event detail shows schedule versions, exceptions, occurrences and the four summary tiles', async ({
  page,
}) => {
  await open(page, '/events/event-1');

  // AC-5: one detail carries the four summary tiles beside the schedule
  // versions, the exceptions and the occurrence list. The Occurrences tile
  // counts the same list the table renders (FR-6b/FR-6e).
  const summary = page.getByRole('region', { name: 'Event summary' });
  await expect(summary).toBeVisible();
  for (const tile of ['Next occurrence', 'Occurrences', 'Attendance', 'Offerings']) {
    await expect(summary.getByText(tile, { exact: true })).toBeVisible();
  }

  await expect(page.getByRole('table', { name: 'Schedule versions' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Exceptions' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Event occurrences' })).toBeVisible();
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

// Reopened with the panel's mount fix: the surface no longer mounts already open with nothing
// focusable, so tabster keeps it in the accessibility tree under a parallel run.
test('the retired attendance route opens the panel for its date', async ({ page }) => {
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
  // The row's Import stays a row control; the page's own verbs live in the single
  // Actions menu with Refresh as the bare utility (FR-9a, FR-42e).
  await expect(page.getByRole('button', { name: 'Actions' })).toBeVisible();
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

test('the events list offers New event as its single visible verb', async ({ page }) => {
  await open(page, '/events');

  // AC-55 as amended (2026-11-22): the series form retired, so the list has one
  // verb — rendered visibly, with no Actions menu — and Refresh stays a bare icon.
  await expect(page.getByRole('button', { name: 'New event' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'New series' })).toHaveCount(0);

  await page.getByRole('button', { name: 'New event' }).click();
  await expect(page).toHaveURL(/\/events\/new$/);
  await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();
});

test('the New event form creates a parent event and activates it', async ({ page, gateway }) => {
  await open(page, '/events');
  await page.getByRole('button', { name: 'New event' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();
  // FR-9a: a form's commit/cancel pair replaces the page's Actions menu.
  await expect(page.getByRole('button', { name: 'Actions' })).toHaveCount(0);
  // AC 8: the create form has no event-number control at any point; the server
  // mints the number, and the read-only field exists only on the edit view.
  await expect(page.getByLabel(/^Event number/)).toHaveCount(0);

  await page.getByLabel(/^Name/).fill('Strategic Conference');
  await page.getByLabel(/^Start time/).fill('09:00');
  await page.getByLabel('End time (optional)').fill('17:00');
  await page.getByRole('combobox', { name: 'Venue type' }).click();
  await page.getByRole('option', { name: 'Auditorium' }).click();
  await page.getByLabel('Venue name (optional)').fill('Main Auditorium');
  await page.getByLabel('Description (optional)').fill('Annual leadership conference.');
  await page.getByLabel('Occurrence 1 date').fill('2026-01-15');
  // FR-42c/AC 7: the picker opens on the seeded Everyone audience as an ordered
  // set - a Dropdown that adds audiences, and a chip carrying that audience's own
  // count and the Primary marker.
  await expect(page.getByRole('combobox', { name: 'Audience' })).toContainText(
    'Choose an audience to add',
  );
  const chosen = page.getByRole('toolbar', { name: 'Chosen audiences' });
  await expect(chosen.getByText('Everyone', { exact: true })).toBeVisible();
  await expect(chosen.getByText('Primary · 96 members')).toBeVisible();

  await page.getByRole('button', { name: 'Save and activate' }).click();

  await expect(page).toHaveURL(/\/events\/created-EVT-2026-\d+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Strategic Conference' })).toBeVisible();

  // AC-56: the recorded wire carries the parent fields, the ordered audience set
  // and one occurrence, and never the retired, API-derived or minted ones.
  const body = gateway.lastEventCreate as Record<string, unknown>;
  expect(body).toMatchObject({
    name: 'Strategic Conference',
    audienceIds: ['aud-everyone'],
    startTime: '09:00',
    endTime: '17:00',
    venueType: 'auditorium',
    venueName: 'Main Auditorium',
    description: 'Annual leadership conference.',
    tracksMembers: true,
  });
  expect(body.occurrences).toEqual([{ date: '2026-01-15' }]);
  for (const key of [
    'eventNo',
    'audienceId',
    'sessions',
    'startDate',
    'endDate',
    'ministry',
    'presbyterOnly',
    'status',
  ]) {
    expect(body).not.toHaveProperty(key);
  }
  // Save and activate is a second request carrying status alone (FR-42b).
  expect(gateway.lastEventPatch).toEqual({ status: 'active' });
});

test('a create 409 is the form banner, not a field error', async ({ page, gateway }) => {
  // AC 8: the create's only 409 is the server-minted number's collision, and the
  // form has no number field to bind it to.
  gateway.simulateMintCollision = true;

  await open(page, '/events/new');
  await expect(page.getByLabel(/^Event number/)).toHaveCount(0);
  await page.getByLabel(/^Name/).fill('Duplicate conference');
  await expect(
    page.getByRole('toolbar', { name: 'Chosen audiences' }).getByText('Everyone', { exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Save draft' }).click();

  await expect(page).toHaveURL(/\/events\/new$/);
  const banner = page.getByRole('group', { name: 'The event was not saved' });
  await expect(banner).toBeVisible();
  await expect(banner.getByText('Event number EVT-2026-901 is already in use')).toBeVisible();
  // No Field renders a validation message: the 409 is never a field-level error.
  await expect(page.locator('form').getByRole('alert')).toHaveCount(0);
});

// --- The detail's write verbs (FR-42e, AC-62) -------------------------------

test('Archive makes the event read-only and removes every write verb', async ({
  page,
  gateway,
}) => {
  await open(page, '/events/event-1');
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday Service' })).toBeVisible();

  // An active parent offers Edit and Archive in the one menu, with Refresh bare.
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  await openActions(page);
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Activate' })).toHaveCount(0);
  await menu.getByRole('menuitem', { name: 'Archive' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Archive this event?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Archive event' }).click();

  // AC-62: every write verb is absent, no Restore is offered, and the page says it is read-only.
  await expect(page.getByText('This event is archived')).toBeVisible();
  await expect(page.getByText('Archived', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Restore' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Cancel / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add schedule version' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add exception' })).toHaveCount(0);

  expect(gateway.lastEventArchive).toEqual({ eventId: 'event-1' });
});

test('Cancel on an occurrence row collects a reason and shows it in the row', async ({
  page,
  gateway,
}) => {
  await open(page, '/events/event-2');
  const occurrences = page.getByRole('table', { name: 'Event occurrences' });
  await occurrences.getByRole('button', { name: 'Cancel Jan 10, 2026' }).click();

  const dialog = page.getByRole('dialog', { name: 'Cancel this date' });
  await expect(dialog).toBeVisible();
  // AC-64: a blank reason is refused here, so `reason_required` is never reached.
  await dialog.getByRole('button', { name: 'Cancel date' }).click();
  await expect(dialog.getByText('Enter a reason for cancelling this date.')).toBeVisible();
  expect(gateway.lastOccurrenceCancel).toBeNull();

  await dialog.getByRole('textbox', { name: 'Reason' }).fill('Public holiday');
  await dialog.getByRole('button', { name: 'Cancel date' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  const january = occurrences.getByRole('row', { name: /Jan 10, 2026/ });
  await expect(january.getByText('Cancelled', { exact: true }).first()).toBeVisible();
  await expect(january.getByText('Reason: Public holiday')).toBeVisible();

  expect(gateway.lastOccurrenceCancel).toEqual({
    eventId: 'event-2',
    date: '2026-01-10',
    body: { note: 'Public holiday' },
  });
});

test('Add schedule version appends a version built from the closed vocabulary', async ({
  page,
  gateway,
}) => {
  await open(page, '/events/series-1');
  await page.getByRole('button', { name: 'Add schedule version' }).click();

  const dialog = page.getByRole('dialog', { name: 'Add schedule version' });
  await expect(dialog).toBeVisible();
  // AC-63: the form never offers a raw RRULE field.
  await expect(dialog.getByRole('textbox', { name: /Recurrence rule/ })).toHaveCount(0);

  await dialog.getByLabel('Effective from').fill('2026-06-07');
  await dialog.getByRole('combobox', { name: 'Repeats' }).click();
  // Fluent portals the option list outside the dialog surface.
  await page.getByRole('option', { name: 'Fortnightly' }).click();
  await dialog.getByRole('button', { name: 'Add version' }).click();

  const versions = page.getByRole('table', { name: 'Schedule versions' });
  await expect(versions.getByText('Fortnightly', { exact: true })).toBeVisible();
  await expect(versions.getByText('Jun 7, 2026', { exact: true })).toBeVisible();

  // FR-42f: a weekly rule that carries INTERVAL is stored with WKST=SU, because
  // RFC 5545 counts interval weeks from the week start while the church week
  // begins on Sunday.
  expect(gateway.lastScheduleVersion).toEqual({
    eventId: 'series-1',
    body: {
      effectiveFrom: '2026-06-07',
      rrule: 'FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=SU',
      endsOn: null,
    },
  });
});

test('Add exception offers extra dates only and shows the added date', async ({
  page,
  gateway,
}) => {
  await open(page, '/events/series-1');
  await page.getByRole('button', { name: 'Add exception' }).click();

  const dialog = page.getByRole('dialog', { name: 'Add exception' });
  await expect(dialog).toBeVisible();
  // FR-42e: the cancelled kind is not authored from the UI.
  await expect(dialog.getByRole('combobox', { name: /Kind/ })).toHaveCount(0);

  await dialog.getByLabel('Date').fill('2026-11-29');
  await dialog.getByLabel('Note (optional)').fill('Harvest thanksgiving');
  await dialog.getByRole('button', { name: 'Add extra date' }).click();

  const exceptions = page.getByRole('table', { name: 'Exceptions' });
  await expect(exceptions.getByText('Nov 29, 2026', { exact: true })).toBeVisible();
  await expect(exceptions.getByText('Harvest thanksgiving')).toBeVisible();

  expect(gateway.lastException).toEqual({
    eventId: 'series-1',
    body: { date: '2026-11-29', kind: 'extra', note: 'Harvest thanksgiving' },
  });
});

test('Remove deletes one date’s exception directive', async ({ page, gateway }) => {
  await open(page, '/events/series-1');
  const exceptions = page.getByRole('table', { name: 'Exceptions' });
  await exceptions.getByRole('button', { name: 'Remove exception on Jan 11, 2026' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Remove exception' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove exception' }).click();

  await expect(exceptions.getByRole('row', { name: /Jan 11, 2026/ })).toHaveCount(0);
  expect(gateway.lastExceptionDelete).toEqual({ eventId: 'series-1', date: '2026-01-11' });
});
