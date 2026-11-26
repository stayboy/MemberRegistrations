import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright/test';
import { NAV_STORAGE_KEY } from '../src/shell/nav-state';
import type { AccentId, Scheme } from '../src/theme/brand';
import { expect, open, seedSession, seedTheme, test } from './fixtures';

/**
 * Screenshot baseline for the live build. This file is deliberately excluded
 * from `ui:e2e`: it writes the committed images under `e2e/baseline/` instead of
 * asserting, and it is run with `npm run ui:capture` when a screen changes.
 *
 * Every name, viewport and route is mirrored in `e2e/baseline/README.md`.
 */
const BASELINE_DIR = fileURLToPath(new URL('./baseline/', import.meta.url));

interface ScreenOptions {
  readonly width: number;
  readonly height: number;
  readonly accent?: AccentId;
  readonly scheme?: Scheme;
  readonly collapsed?: boolean;
}

async function openScreen(page: Page, route: `/${string}`, options: ScreenOptions): Promise<void> {
  // Pin the browser clock before navigation: the series next-occurrence, the
  // add-member default joined date and the events/date windows all read "today".
  await page.clock.setFixedTime(new Date('2026-01-05T12:00:00.000Z'));
  await page.setViewportSize({ width: options.width, height: options.height });
  await seedTheme(page, options.accent ?? 'fluent', options.scheme ?? 'light');
  if (options.collapsed) {
    await page.addInitScript(
      ({ key, value }: { key: string; value: string }) => {
        localStorage.setItem(key, value);
      },
      { key: NAV_STORAGE_KEY, value: 'collapsed' },
    );
  }
  await open(page, route);
}

/**
 * Waits for the fonts and for two paint frames instead of a sleep: Fluent
 * inserts its stylesheet at runtime, and a capture taken before that paint can
 * miss the theme entirely. There is no connection pill to wait for any more
 * (FR-10): the healthy state says nothing, so the paint frames are the gate.
 */
async function capture(page: Page, name: string): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const running = document.getAnimations().filter((animation) => {
      const endTime = animation.effect?.getComputedTiming().endTime;
      return (
        animation.playState === 'running' && typeof endTime === 'number' && Number.isFinite(endTime)
      );
    });
    await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });

  await page.screenshot({
    path: join(BASELINE_DIR, `${name}.png`),
    animations: 'disabled',
    caret: 'hide',
  });
}

/**
 * The create form's period arm: Repeats on (the builder renders only then), the
 * named period chosen, and the resolved-dates summary settled. The fixture's
 * preview resolves no occurrences, so its empty line is the settled summary.
 */
async function chooseNamedPeriod(page: Page, name: string): Promise<void> {
  await page.getByRole('switch', { name: 'Repeats' }).click();
  await page.getByRole('combobox', { name: 'Named period' }).click();
  await page.getByRole('option', { name }).click();
  await expect(page.getByLabel(/^Cycle month/)).toBeVisible();
  await expect(page.getByText('No dates resolve in the next 90 days')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

// --- Shell -----------------------------------------------------------------

test('shell light', async ({ page }) => {
  await openScreen(page, '/members', { width: 1440, height: 900 });
  await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Members' })).toBeVisible();
  await capture(page, 'shell-light');
});

test('shell dark', async ({ page }) => {
  await openScreen(page, '/members', { width: 1440, height: 900, scheme: 'dark' });
  await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Members' })).toBeVisible();
  await capture(page, 'shell-dark');
});

test('shell collapsed', async ({ page }) => {
  await openScreen(page, '/members', { width: 1440, height: 900, collapsed: true });
  await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await capture(page, 'shell-collapsed');
});

test('shell mobile', async ({ page }) => {
  await openScreen(page, '/members', { width: 390, height: 844, collapsed: true });
  await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sections' })).toBeVisible();
  await capture(page, 'shell-mobile');
});

test('shell meadow accent', async ({ page }) => {
  await openScreen(page, '/members', { width: 1440, height: 900, accent: 'meadow' });
  await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Members' })).toBeVisible();
  await capture(page, 'shell-meadow');
});

// --- Members ---------------------------------------------------------------

test('members list', async ({ page }) => {
  await openScreen(page, '/members', { width: 1440, height: 900 });
  await expect(page.getByRole('table', { name: 'Members' })).toBeVisible();
  await capture(page, 'members-list');
});

test('member detail', async ({ page }) => {
  await openScreen(page, '/members/M-1001', { width: 1440, height: 900 });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Kwame Asante (Male, 41y)' }),
  ).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Member record sections' })).toBeVisible();
  // The member-detail mock shows the household-coverage surface.
  await page.getByRole('tab', { name: 'Welfare & Services' }).click();
  await expect(page.getByText('POL-0001')).toBeVisible();
  await capture(page, 'member-detail');
});

test('member detail overview', async ({ page }) => {
  await openScreen(page, '/members/M-1001', { width: 1440, height: 900 });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Kwame Asante (Male, 41y)' }),
  ).toBeVisible();
  await capture(page, 'member-detail-overview');
});

test('member detail overview empty', async ({ page }) => {
  await openScreen(page, '/members/M-1002', { width: 1440, height: 900 });
  await expect(page.getByRole('heading', { level: 1, name: 'Ama Mensah' })).toBeVisible();
  await capture(page, 'member-detail-overview-empty');
});

test('member detail overview narrow', async ({ page }) => {
  await openScreen(page, '/members/M-1001', { width: 860, height: 900 });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Kwame Asante (Male, 41y)' }),
  ).toBeVisible();
  await capture(page, 'member-detail-overview-narrow');
});

test('member detail verified', async ({ page }) => {
  await openScreen(page, '/members/M-1010', { width: 1440, height: 900 });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Akosua Boateng (Female, 37y)' }),
  ).toBeVisible();
  // MR-34/AC-MR46: the newest proof names the badge; the title lists every proof.
  const badge = page.getByTestId('member-verified');
  await expect(badge).toHaveAccessibleName('Verified · Officer · Jan 4, 2026');
  await capture(page, 'member-detail-verified');
});

test('add member', async ({ page }) => {
  await openScreen(page, '/members/new', { width: 1440, height: 1123 });
  await expect(page.getByRole('heading', { level: 1, name: 'Person and contact' })).toBeVisible();
  await expect(page.getByLabel('Member number')).toBeVisible();
  await capture(page, 'member-add');
});

// --- Events and series -----------------------------------------------------

test('events list', async ({ page }) => {
  await openScreen(page, '/events', { width: 1440, height: 900 });
  await expect(page.getByRole('table', { name: 'Events' })).toBeVisible();
  await capture(page, 'events-list');
});

test('events new', async ({ page }) => {
  await openScreen(page, '/events/new', { width: 1440, height: 1123 });
  await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();
  await capture(page, 'events-new');
});

test('events new period', async ({ page }) => {
  await openScreen(page, '/events/new', { width: 1440, height: 1123 });
  await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();
  await chooseNamedPeriod(page, 'Communion Week');
  await capture(page, 'events-new-period');
});

test('events new period monthly', async ({ page }) => {
  await openScreen(page, '/events/new', { width: 1440, height: 1123 });
  await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();
  await chooseNamedPeriod(page, 'Communion Week');
  // The monthly arm: one date per cycle, so the day inside the period replaces
  // the cycle month (the second drawing in the pair).
  await page.getByRole('radio', { name: 'Monthly' }).click();
  await page.getByRole('combobox', { name: 'Day inside the period' }).click();
  await page.getByRole('option', { name: 'Sunday' }).click();
  await expect(page.getByLabel(/^Cycle month/)).toHaveCount(0);
  await expect(page.getByText('No dates resolve in the next 90 days')).toBeVisible();
  await capture(page, 'events-new-period-monthly');
});

test('event edit', async ({ page }) => {
  // FR-42b: the same form serves the edit route, with Event number and Members
  // tracking read-only.
  await openScreen(page, '/events/event-1/edit', { width: 1440, height: 1123 });
  await expect(page.getByRole('heading', { level: 1, name: 'Edit event' })).toBeVisible();
  await expect(page.getByLabel(/^Event number/)).toHaveAttribute('readonly', '');
  await expect(page.getByRole('switch', { name: 'Members tracking' })).toBeDisabled();
  await capture(page, 'event-edit');
});

test('event detail', async ({ page }) => {
  await openScreen(page, '/events/event-1', { width: 1440, height: 900 });
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday Service' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Event occurrences' })).toBeVisible();
  await capture(page, 'event-detail');
});

test('attendance dialog', async ({ page }) => {
  await openScreen(page, '/events/event-1', { width: 1440, height: 900 });
  await page.getByRole('button', { name: 'View rows for Jan 4, 2026' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('table', { name: 'Attendance rows' })).toBeVisible();
  await expect(dialog.getByText('Kwame Asante (Male, 41y)')).toBeVisible();
  await capture(page, 'event-attendance-dialog');
});

test('headcount dialog', async ({ page }) => {
  await openScreen(page, '/events/event-1', { width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Record headcount' }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Record a headcount', { exact: false })).toBeVisible();
  await capture(page, 'event-headcount-dialog');
});

test('import panel', async ({ page }) => {
  await openScreen(page, '/events/event-1', { width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Import' }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Selected occurrence', { exact: true })).toBeVisible();
  await capture(page, 'event-import-panel');
});

test('event detail period', async ({ page }) => {
  // The seeded period event (round `detail-grammar`): the named-period block sits
  // at the foot of the identity card with the period's name and the catalogue's
  // definition, and the occurrence table is the stored record - the detail draws no
  // preview (Q1). The window is explicit because the page's default ends today and
  // this event's dates are the three Sundays ahead of it.
  await openScreen(page, '/events/event-period?from=2026-01-01&to=2026-04-30', {
    width: 1440,
    height: 900,
  });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Miracle Sunday choir ministration' }),
  ).toBeVisible();
  const identity = page.getByTestId('event-identity');
  // The name only; the day and frequency ride the glyph's tooltip (drawing v16).
  await expect(identity.getByTestId('event-period-provenance')).toHaveText('Communion Week');
  await expect(identity.getByTestId('event-period-definition')).toContainText(
    'week of the monthly communion service',
  );
  // The offerings summary is the count and the bracketed names, each an anchor,
  // with no grid below it (owner, 2026-11-26).
  await expect(identity.getByTestId('event-offerings')).toHaveText(
    '2 (Sunday offering · Building fund)',
  );
  await expect(identity.locator('a')).toHaveCount(2);
  await expect(page.getByRole('table', { name: 'Active offerings' })).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Event occurrences' })).toBeVisible();
  await capture(page, 'event-detail-period');
});

test('series detail', async ({ page }) => {
  // The series detail retired; the series id is the event parent, so this is the
  // event detail under the same baseline name (AC-51).
  await openScreen(page, '/events/series-1', { width: 1440, height: 1000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday Service' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Event occurrences' })).toBeVisible();
  await capture(page, 'series-detail');
});

// --- Shepherding and contacts ----------------------------------------------

test('shepherding officers', async ({ page }) => {
  await openScreen(page, '/shepherding/officers', { width: 1440, height: 900 });
  await expect(page.getByRole('heading', { level: 1, name: 'Shepherding officers' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Shepherding officers' })).toBeVisible();
  await capture(page, 'shepherding-officers');
});

test('shepherding roster', async ({ page }) => {
  await openScreen(page, '/shepherding/roster?officer=M-1001', { width: 1440, height: 900 });
  await expect(page.getByRole('heading', { level: 1, name: 'Shepherding roster' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Officer roster' })).toBeVisible();
  await capture(page, 'shepherding-roster');
});

test('shepherding report', async ({ page }) => {
  await openScreen(page, '/shepherding/report', { width: 1440, height: 900 });
  await expect(page.getByRole('heading', { level: 1, name: 'Church report' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Per-officer report' })).toBeVisible();
  await capture(page, 'shepherding-report');
});

test('contacts dialog', async ({ page }) => {
  await openScreen(page, '/members', { width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Contacts · 2 for Kwame Asante (Male, 41y)' }).click();

  const dialog = page.getByRole('dialog', { name: 'Contacts' });
  await expect(dialog).toBeVisible();
  // The flat list's first row: kind, value and status live in one row (FR-78).
  await expect(dialog.getByRole('listitem').filter({ hasText: '+233 20 000 0001' })).toBeVisible();
  await capture(page, 'contacts-dialog');
});

test('contacts editable', async ({ page }) => {
  await openScreen(page, '/members/M-1001', { width: 1440, height: 900 });
  await page.getByRole('button', { name: 'View Contacts (2)' }).click();

  const dialog = page.getByRole('dialog', { name: 'Contacts' });
  await expect(dialog).toBeVisible();
  // AC-53: the add row sits above the list, and an owned row carries its named
  // Edit and Remove glyph actions (FR-78, FR-81).
  await expect(dialog.getByRole('textbox', { name: 'Contact value' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Edit phone +233 20 000 0001' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Remove phone +233 20 000 0001' })).toBeVisible();
  await capture(page, 'contacts-editable');
});

// --- Public member acceptance page -----------------------------------------

test('acceptance entry', async ({ page }) => {
  // FR-25b/MR-51: the standalone page, outside the officer shell and the `#/`
  // router. Preview serves it from `v.html`; production maps `/v` to the same
  // document (nginx.conf), and the base is `VERIFICATION_LINK_BASE`.
  await page.clock.setFixedTime(new Date('2026-01-05T12:00:00.000Z'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedTheme(page, 'fluent', 'light');
  await page.goto('v.html#t=capture-token');
  await expect(page.getByRole('heading', { level: 1, name: 'Verify your contact' })).toBeVisible();
  await expect(page.getByLabel('Six-digit code')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify my contact' })).toBeDisabled();
  await capture(page, 'acceptance');
});

// --- Imports and settings --------------------------------------------------

test('imports members', async ({ page }) => {
  await openScreen(page, '/imports/members', { width: 1440, height: 1150 });
  await expect(page.getByRole('heading', { level: 1, name: 'Member database' })).toBeVisible();
  await expect(page.getByText('Choose a CSV or the Excel template')).toBeVisible();
  await capture(page, 'imports-members');
});

test('imports batch lookup', async ({ page }) => {
  await openScreen(page, '/imports/batches', { width: 1440, height: 900 });
  await expect(page.getByRole('heading', { level: 1, name: 'Batch lookup' })).toBeVisible();
  await expect(page.getByText("This tab's imports")).toBeVisible();
  await capture(page, 'imports-batches');
});

test('settings', async ({ page }) => {
  await openScreen(page, '/settings', { width: 1440, height: 1150 });
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Date and time' })).toBeVisible();
  await capture(page, 'settings');
});
