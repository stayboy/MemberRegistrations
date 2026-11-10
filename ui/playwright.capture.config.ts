import { fileURLToPath } from 'node:url';
import { defineConfig } from 'playwright/test';

/**
 * The baseline capture is a separate suite: it writes committed screenshots
 * instead of asserting, so it must never ride along with `npm run ui:e2e`. It
 * shares the main config's production build and preview server, and pins the
 * same locale, timezone and reduced-motion settings so a regeneration is
 * deterministic on every machine.
 */
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/capture.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/MemberRegistrations/',
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: 'npm --prefix ui run build && npm --prefix ui run preview -- --port 4173 --strictPort',
    cwd: repoRoot,
    // Same baked origin as the assertion suite, so a capture and an assertion
    // see identical bundles.
    env: { VITE_GATEWAY_URL: 'https://member-registrations-mind-logs.vercel.app' },
    url: 'http://localhost:4173/MemberRegistrations/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
