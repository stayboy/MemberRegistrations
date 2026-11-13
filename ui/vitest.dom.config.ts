import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The DOM lane. Deliberately a second config rather than a change to
 * `vitest.config.ts`: the 400-odd node tests run in about three seconds because
 * they never build a DOM, and moving them all to jsdom would tax every one of them
 * for the benefit of a few. `*.dom.test.tsx` opts in; everything else stays node.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.dom.test.tsx'],
    setupFiles: ['./vitest.setup.dom.ts'],
    // Fluent renders overlays into document.body and react-query settles asynchronously;
    // a DOM test needs room, not speed.
    testTimeout: 15000,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});
