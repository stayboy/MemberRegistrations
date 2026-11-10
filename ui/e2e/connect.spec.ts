import { expect } from 'playwright/test';
import { open, test } from './fixtures';

/**
 * FR-12 / FR-13 / AC-10a: the gateway origin is baked into the build, so the
 * connect page collects only the email, never shows or accepts an origin, and a
 * stale `mr.gateway.v1` from an earlier build is cleared instead of honoured.
 */
test.describe('connect page', () => {
  test('collects only the officer email and shows no gateway origin', async ({ page }) => {
    await open(page, '/connect');

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Officer email')).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(1);
    await expect(page.getByLabel('Gateway URL')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('member-registrations-mind-logs');
  });

  test('a failed health probe shows the unreachable copy and sends nothing', async ({ page }) => {
    // Registered after the fixture, so it wins: Playwright runs the newest
    // matching handler first.
    await page.route('**/health', (route) => route.fulfill({ status: 503, body: '' }));

    await open(page, '/connect');
    await page.getByLabel('Officer email').fill('officer@church.test');
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();

    await expect(
      page.getByText(
        'The service is unreachable. Try again in a moment; if it persists, contact the administrator.',
      ),
    ).toBeVisible();
    await expect(page.getByText(/sign-in link has been sent/i)).toHaveCount(0);
  });

  test('clears a stale gateway entry and never reads it', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('mr.gateway.v1', 'https://stale.example');
    });

    await open(page, '/connect');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    expect(await page.evaluate(() => localStorage.getItem('mr.gateway.v1'))).toBeNull();
  });
});
