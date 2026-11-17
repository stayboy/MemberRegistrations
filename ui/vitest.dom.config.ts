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
    // jsdom rendering is CPU-bound: running files in parallel starves the render and
    // makes an async query lose to the 1 s Testing Library budget, which failed
    // SessionHeadcount's dialog query under load while the same test passed alone
    // (owner ruling 2026-11-17). Serial costs about thirty extra seconds and makes
    // the lane deterministic locally and in CI.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});
