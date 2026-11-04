#!/usr/bin/env node
// series-orm-trial — the ticket-03 comparison harness.
//
// Measures the Series repository operations on PGlite so the raw baseline and the Drizzle trial can
// be compared. It times each operation over N runs and reports the p95; the query counts per
// operation are recorded from the implementation in the round doc. This is a trial artefact, not a
// CI gate.
//
// Usage: npm run build && node scripts/round/series-orm-trial.mjs

import { performance } from 'node:perf_hooks';
import { createPgliteDb } from '../../dist/db/pglite.js';
import { migrate } from '../../dist/db/migrate.js';
import { SeriesRepository } from '../../dist/repos/series.js';

const N = Number(process.env.TRIAL_RUNS ?? 50);

function percentile(times, p) {
  const sorted = [...times].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[index];
}

const day = (offset) =>
  new Date(Date.UTC(2030, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10);

const db = await createPgliteDb();
await migrate(db);
const repo = new SeriesRepository(db);

await db.query("insert into ministries (code, name) values ('TRIAL', 'Trial ministry')");

const seed = await repo.create(
  {
    name: 'Trial series',
    ministryCode: 'TRIAL',
    effectiveFrom: '2026-01-04',
    rrule: 'FREQ=WEEKLY;BYDAY=SU',
  },
  'trial',
);

// `list` and `get` run before `create`, so the create loop does not inflate their timing.
const operations = [
  ['list', () => repo.list()],
  ['get', () => repo.get(seed.id)],
  ['update', () => repo.update(seed.id, { description: 'trial' }, 'trial')],
  [
    'addSchedule',
    (i) =>
      repo.addSchedule(seed.id, { effectiveFrom: day(i), rrule: 'FREQ=WEEKLY;BYDAY=SU' }, 'trial'),
  ],
  ['setException', (i) => repo.setException(seed.id, { date: day(i), kind: 'cancelled' }, 'trial')],
  [
    'removeException',
    async (i) => {
      await repo.setException(seed.id, { date: day(i), kind: 'cancelled' }, 'trial');
      return repo.removeException(seed.id, day(i));
    },
  ],
  ['occurrences', () => repo.occurrences(seed.id, '2026-01-01', '2026-03-01')],
  [
    'create',
    (i) =>
      repo.create(
        {
          name: `Trial series ${i}`,
          effectiveFrom: '2026-01-04',
          rrule: 'FREQ=WEEKLY;BYDAY=SU',
        },
        'trial',
      ),
  ],
];

const results = {};
for (const [name, fn] of operations) {
  const times = [];
  for (let i = 0; i < N; i++) {
    const start = performance.now();
    await fn(i);
    times.push(performance.now() - start);
  }
  results[name] = {
    medianMs: Number(percentile(times, 0.5).toFixed(2)),
    p95Ms: Number(percentile(times, 0.95).toFixed(2)),
  };
}

console.log(`runs=${N}`);
console.log(JSON.stringify(results, null, 2));
await db.close();
