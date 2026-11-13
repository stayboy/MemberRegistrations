import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
    // 20s was too tight for the PGlite-backed `beforeAll`: instantiating a Wasm Postgres and
    // running the migrations under ~16-way file parallelism can take longer than that on a loaded
    // machine, and a timed-out hook closes the engine under in-flight queries ("PGlite is closed").
    // The hook timeout is a liveness guard, not a performance budget.
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
