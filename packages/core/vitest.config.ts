import { defineConfig } from 'vitest/config'

// Per docs/02 §4 — Vitest is the unit test framework.
// Integration tests using Testcontainers live alongside unit tests and
// are gated on `TEST_DATABASE_URL` (or a Docker daemon for Testcontainers
// to spin one up).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Integration tests boot containers / talk to Postgres; give them room.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Run integration files serially; unit files can run in parallel.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
