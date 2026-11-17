import type { Page } from 'playwright/test';
import { expect, open, SESSION_TOKEN, seedSession, THEME_STORAGE_KEY, test } from './fixtures';

/**
 * AC-27: a saved tab restores its appearance and its sidebar state, the credential arrives only from
 * `sessionStorage`, and the API bearer is nowhere in browser storage (FR-15, FR-19, FR-47).
 *
 * The preference is written once, in the page, after the first load - deliberately not through
 * `seedTheme`, whose init script re-writes the key on every navigation and would make the reload
 * assertion prove nothing. The sidebar key is never written by the test at all, so its survival is
 * the app's own write.
 *
 * "Without a flash of the other scheme" is FR-47's other half and is not asserted here: a flash is a
 * paint-timeline observation, not a DOM state a settled page can answer for.
 */

/** `--colorBrandBackground` for the ocean accent in the dark scheme (ramp stop 70). */
const OCEAN_DARK_BRAND_BACKGROUND = '#005e85';

/** Every stored value as one string per entry; no key name is assumed. */
async function storedValues(page: Page): Promise<{ session: string; local: string }> {
  return page.evaluate(() => {
    const dump = (storage: Storage): string => {
      const values: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index) ?? '';
        values.push(`${key}=${storage.getItem(key) ?? ''}`);
      }
      return values.join('\n');
    };
    return { session: dump(sessionStorage), local: dump(localStorage) };
  });
}

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

test('the accent, scheme and collapsed sidebar survive a reload and the bearer stays out of localStorage', async ({
  page,
}) => {
  // FR-15: the shell verifies the stored credential with the gateway, so the bearer it sends is the
  // credential the browser held, not one read from anywhere else.
  const bearers: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/auth/me') {
      const header = request.headers()['authorization'];
      if (header) bearers.push(header);
    }
  });

  await open(page, '/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

  // AC-27's Given: a saved preference. Written once here, so the reload below can only restore it
  // by reading `localStorage` on start-up.
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [
    THEME_STORAGE_KEY,
    JSON.stringify({ accent: 'ocean', scheme: 'dark' }),
  ] as const);
  await page.reload();

  // FR-47: the accent and scheme are restored before first paint, and the next paint agrees.
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  const sidebar = page.getByRole('complementary', { name: 'Admin navigation' });
  await expect(sidebar.getByRole('combobox', { name: 'Accent theme' })).toContainText('Ocean');
  await expect(sidebar.getByRole('switch', { name: 'Dark mode' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'dark');
  const brandBackground = await page.evaluate(() => {
    const provider = document.querySelector('.fui-FluentProvider');
    return provider ? getComputedStyle(provider).getPropertyValue('--colorBrandBackground') : '';
  });
  expect(brandBackground.trim().toLowerCase()).toBe(OCEAN_DARK_BRAND_BACKGROUND);

  // Collapse the rail: the shell persists the state (FR-6), and the test never writes that key.
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(sidebar.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  await page.reload();

  // The rail came back collapsed, with the collapsed footer's own controls in the restored theme.
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  const reloaded = page.getByRole('complementary', { name: 'Admin navigation' });
  await expect(reloaded.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(reloaded.getByRole('button', { name: 'Accent theme: Ocean' })).toBeVisible();
  await expect(reloaded.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();

  // Expanded again, the footer's dropdown and switch show the same restored preference.
  await reloaded.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(reloaded.getByRole('combobox', { name: 'Accent theme' })).toContainText('Ocean');
  await expect(reloaded.getByRole('switch', { name: 'Dark mode' })).toBeChecked();

  // FR-15/AC-10: the credential the gateway saw is the one in `sessionStorage`, and no localStorage
  // value carries it.
  expect(bearers).toContain(`Bearer ${SESSION_TOKEN}`);
  const stored = await storedValues(page);
  expect(stored.session).toContain(SESSION_TOKEN);
  expect(stored.local).not.toContain(SESSION_TOKEN);
});
