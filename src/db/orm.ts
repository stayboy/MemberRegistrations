import type { PgDatabase } from 'drizzle-orm/pg-core';
import type * as schema from './schema.js';

/**
 * Engine-neutral Drizzle handle. The `pg` and PGlite drivers both produce a
 * `PgDatabase` over the same schema, so repositories depend on this type and
 * never on a concrete driver. The query-result HKT differs per driver and is
 * deliberately erased here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Orm = PgDatabase<any, typeof schema>;
