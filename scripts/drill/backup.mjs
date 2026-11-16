#!/usr/bin/env node
/**
 * Backup and restore drill.
 *
 * The release claims a dump taken minutes ago restores into an empty database. That claim needs the run,
 * not a runbook: this dumps the local Compose database, restores it into a scratch database, and compares
 * row counts before dropping the scratch copy. It exits non-zero on any mismatch, so a drill that did not
 * work cannot be reported as one that did.
 *
 * Not a gate step: it needs Docker and the Compose stack, so `npm run verify` stays hermetic.
 *
 *   npm run drill:backup            # dump, restore, compare, clean up
 *   npm run drill:backup -- --keep  # leave drill_restore in place to inspect it
 */
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const keep = args.includes('--keep');

const SERVICE = process.env.DRILL_DB_SERVICE ?? 'db';
const USER = process.env.DRILL_DB_USER ?? 'postgres';
const SOURCE = process.env.DRILL_SOURCE_DB ?? 'member_registrations';
const TARGET = 'drill_restore';

/** The tables the claim rests on: the register, its sessions, and the records that hang off them. */
const TABLES = ['members', 'event_instances', 'contributions', 'attendance'];

function run(what, command, argv, input) {
  const result = spawnSync(command, argv, {
    input,
    maxBuffer: 1024 * 1024 * 256,
    encoding: input === undefined ? 'utf8' : undefined,
  });
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr ?? '').trim();
    throw new Error(`${what} failed (exit ${result.status})${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout;
}

function psql(database, sql) {
  return run(
    `psql ${database}`,
    'docker',
    ['compose', 'exec', '-T', SERVICE, 'psql', '-U', USER, '-d', database, '-tAc', sql],
    undefined,
  ).trim();
}

function counts(database) {
  const selects = TABLES.map((table) => `(select count(*)::text from ${table})`).join(
    " || '|' || ",
  );
  return psql(database, `select ${selects};`)
    .split('|')
    .map((value) => Number(value.trim()));
}

const started = Date.now();
try {
  console.log(`drill: dumping ${SOURCE} from the ${SERVICE} service`);

  const dump = run(
    'pg_dump',
    'docker',
    [
      'compose',
      'exec',
      '-T',
      SERVICE,
      'pg_dump',
      '-U',
      USER,
      '-d',
      SOURCE,
      '--no-owner',
      '--no-privileges',
    ],
    undefined,
  );
  const dumpBytes = typeof dump === 'string' ? Buffer.byteLength(dump, 'utf8') : dump.length;
  if (dumpBytes === 0) throw new Error('pg_dump produced an empty archive');
  console.log(`drill: ${(dumpBytes / 1024).toFixed(1)} KiB captured`);

  const before = counts(SOURCE);

  psql('postgres', `drop database if exists ${TARGET}`);
  psql('postgres', `create database ${TARGET}`);
  run(
    'psql restore',
    'docker',
    [
      'compose',
      'exec',
      '-T',
      SERVICE,
      'psql',
      '-U',
      USER,
      '-d',
      TARGET,
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-f',
      '-',
    ],
    dump,
  );

  const after = counts(TARGET);

  const rows = TABLES.map((table, index) => ({
    table,
    source: before[index],
    restored: after[index],
  }));
  console.log(
    ['', '| table | source | restored |', '| --- | --- | --- |']
      .concat(rows.map((row) => `| ${row.table} | ${row.source} | ${row.restored} |`))
      .join('\n'),
  );

  const mismatch = rows.filter((row) => row.source !== row.restored);
  if (rows.every((row) => row.source === 0)) {
    throw new Error('every probed table is empty: two empty databases matching proves nothing');
  }
  const thin = rows.filter((row) => row.source === 0);
  if (thin.length > 0) {
    console.log(
      `drill: note - ${thin.map((row) => row.table).join(', ')} hold no rows in this stack, so they prove shape, not data`,
    );
  }
  if (mismatch.length > 0) {
    throw new Error(
      `${mismatch.map((row) => `${row.table} ${row.source} != ${row.restored}`).join('; ')}`,
    );
  }

  if (keep) {
    console.log(`drill: ${TARGET} kept for inspection`);
  } else {
    psql('postgres', `drop database if exists ${TARGET}`);
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`drill: PASS - ${TABLES.length} tables restored exactly in ${seconds}s`);
} catch (error) {
  console.error(`drill: FAIL - ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
