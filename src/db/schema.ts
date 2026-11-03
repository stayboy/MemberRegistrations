import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Drizzle mirror of the Ministries slice of `0001_init`. The embedded SQL
 * migrations remain the source of truth; this schema exists so CRUD
 * repositories can build queries without regenerating DDL.
 */
export const ministries = pgTable(
  'ministries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('ministries_code_ci').on(sql`lower(${table.code})`)],
);
