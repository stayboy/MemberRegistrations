import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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

export const eventSeries = pgTable(
  'event_series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    ministryId: uuid('ministry_id').references(() => ministries.id),
    timezone: text('timezone').notNull().default('Africa/Lagos'),
    description: text('description'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (table) => [
    uniqueIndex('event_series_name_ministry')
      .on(
        sql`lower(${table.name})`,
        sql`coalesce(${table.ministryId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${table.archivedAt} is null`),
  ],
);

export const seriesSchedules = pgTable(
  'series_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seriesId: uuid('series_id')
      .notNull()
      .references(() => eventSeries.id, { onDelete: 'cascade' }),
    effectiveFrom: date('effective_from').notNull(),
    rrule: text('rrule').notNull(),
    endsOn: date('ends_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    uniqueIndex('series_schedules_series_effective').on(table.seriesId, table.effectiveFrom),
    index('series_schedules_series').on(table.seriesId, table.effectiveFrom),
  ],
);

export const seriesExceptions = pgTable(
  'series_exceptions',
  {
    seriesId: uuid('series_id')
      .notNull()
      .references(() => eventSeries.id, { onDelete: 'cascade' }),
    occursOn: date('occurs_on').notNull(),
    kind: text('kind').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [primaryKey({ columns: [table.seriesId, table.occursOn] })],
);
