import { loadEnv } from '../config/env.js';
import { createPgDb } from '../db/pg.js';
import { OfficerRepository } from '../repos/officers.js';

/**
 * Operator-only officer management. There is deliberately no HTTP enrolment
 * route: an officer exists because an operator seeded them.
 *
 *   npm run officers:add -- ama@church.org "Ama Mensah" ama
 *   npm run officers:deactivate -- ama@church.org
 *   npm run officers:list
 */
const env = loadEnv();
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is required to manage officers');
  process.exit(1);
}

const db = createPgDb(env.DATABASE_URL);
const officers = new OfficerRepository(db);
const [command, ...args] = process.argv.slice(2);

function usage(): void {
  console.error(
    [
      'Usage:',
      '  npm run officers:add -- <email> <name> <actorId>',
      '  npm run officers:deactivate -- <email>',
      '  npm run officers:list',
    ].join('\n'),
  );
  process.exitCode = 1;
}

try {
  switch (command) {
    case 'add': {
      if (args.length < 3) {
        usage();
        break;
      }
      const result = await officers.add({
        email: args[0]!,
        name: args[1]!,
        actorId: args[2]!,
      });
      console.log(result.reactivated ? `Reactivated ${result.email}` : `Added ${result.email}`);
      break;
    }
    case 'deactivate': {
      if (args.length < 1) {
        usage();
        break;
      }
      await officers.deactivate(args[0]!);
      console.log(`Deactivated ${args[0]!.trim().toLowerCase()}`);
      break;
    }
    case 'list': {
      const rows = await officers.list();
      if (rows.length === 0) {
        console.log('No officers. Add one with npm run officers:add -- <email> <name> <actorId>');
      } else {
        console.table(rows);
      }
      break;
    }
    default:
      usage();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.close();
}
