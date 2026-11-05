import { fileURLToPath } from 'node:url';
import { defineConfig } from 'playwright/test';

/**
 * The production build is the thing under test: `vite preview` serves `dist`
 * under the GitHub Pages base (`/MemberRegistrations/`). The webServer command is
 * written from the repository root, so `cwd` moves up from this `ui/` config
 * directory; that keeps `npm --prefix ui …` pointing at the workspace rather than
 * at `ui/ui`.
 */
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  // The baseline capture writes committed screenshots and has its own config;
  // keep it out of the assertion suite.
  testIgnore: '**/capture.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/MemberRegistrations/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Calendar dates are rendered with `Intl`; pin the locale and zone so the
    // fixture dates mean the same thing on every machine.
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
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
    url: 'http://localhost:4173/MemberRegistrations/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
