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
 * miss the theme entirely.
 */
async function capture(page: Page, name: string): Promise<void> {
  // The shell probes `/health` after mount; the badge starts as "Checking API"
  // and its colour transition continues after the text changes. Wait for the
  // settled success state and every finite CSS animation so a shot never catches
  // a half-painted badge.
  await expect(page.getByRole('status').filter({ hasText: 'API connected' })).toBeVisible();

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
  await expect(page.getByRole('heading', { level: 1, name: 'Kwame Asante' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Member record sections' })).toBeVisible();
  // The member-detail mock shows the household-coverage surface.
  await page.getByRole('tab', { name: 'Subscriptions' }).click();
  await expect(page.getByText('POL-0001')).toBeVisible();
  await capture(page, 'member-detail');
});

test('add member', async ({ page }) => {
  await openScreen(page, '/members/new', { width: 1440, height: 1200 });
  await expect(page.getByRole('heading', { level: 1, name: 'Add member' })).toBeVisible();
  await expect(page.getByLabel('Member number')).toBeVisible();
  await capture(page, 'member-add');
});

// --- Events and series -----------------------------------------------------

test('events list', async ({ page }) => {
  await openScreen(page, '/events', { width: 1440, height: 900 });
  await expect(page.getByRole('table', { name: 'Events' })).toBeVisible();
  await capture(page, 'events-list');
});

test('event detail', async ({ page }) => {
  await openScreen(page, '/events/event-1', { width: 1440, height: 900 });
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday Service' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Event sessions' })).toBeVisible();
  await capture(page, 'event-detail');
});

test('attendance dialog', async ({ page }) => {
  await openScreen(page, '/events/event-1', { width: 1440, height: 900 });
  await page.getByRole('button', { name: /View rows for/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('table', { name: 'Attendance rows' })).toBeVisible();
  await expect(dialog.getByText('Kwame Asante')).toBeVisible();
  await capture(page, 'event-attendance-dialog');
});

test('series list', async ({ page }) => {
  await openScreen(page, '/events/series', { width: 1440, height: 900 });
  await expect(page.getByRole('table', { name: 'Series' })).toBeVisible();
  await capture(page, 'series-list');
});

test('series detail', async ({ page }) => {
  await openScreen(page, '/events/series/series-1', { width: 1440, height: 1000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday Service' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Schedule versions' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Contacts · 2 for Kwame Asante' }).click();

  const dialog = page.getByRole('dialog', { name: 'Contacts' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Phone' })).toBeVisible();
  await capture(page, 'contacts-dialog');
});

// --- Imports and settings --------------------------------------------------

test('imports members', async ({ page }) => {
  await openScreen(page, '/imports/members', { width: 1440, height: 1150 });
  await expect(page.getByRole('heading', { level: 1, name: 'Member database' })).toBeVisible();
  await expect(page.getByText('Choose a CSV or the Excel template')).toBeVisible();
  await capture(page, 'imports-members');
});

test('imports attendance', async ({ page }) => {
  // The deep link centres the date window on the fixture session, so the
  // occurrence resolves without touching the browser clock.
  await openScreen(page, '/imports/attendance?event=event-1&date=2026-01-04', {
    width: 1440,
    height: 1150,
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Attendance registry' })).toBeVisible();
  await expect(page.getByText('Choose a CSV or the Excel template')).toBeVisible();
  await capture(page, 'imports-attendance');
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
