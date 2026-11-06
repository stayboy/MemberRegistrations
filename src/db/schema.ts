import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
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

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberNo: text('member_no').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    otherNames: text('other_names'),
    maidenName: text('maiden_name'),
    alias: text('alias'),
    dob: date('dob'),
    gender: text('gender').notNull().default('undisclosed'),
    placeOfResidence: text('place_of_residence'),
    addressLine: text('address_line'),
    joinedOn: date('joined_on'),
    isPresbyter: boolean('is_presbyter').notNull().default(false),
    presbyterRank: integer('presbyter_rank'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (table) => [uniqueIndex('members_member_no_ci').on(sql`lower(${table.memberNo})`)],
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

export const memberContacts = pgTable(
  'member_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    normalizedValue: text('normalized_value').notNull(),
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('member_contacts_value').on(table.normalizedValue),
    uniqueIndex('member_contacts_order').on(table.memberId, table.displayOrder),
    index('member_contacts_member').on(table.memberId),
  ],
);

export const memberContactLinks = pgTable(
  'member_contact_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => memberContacts.id, { onDelete: 'cascade' }),
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('member_contact_links_pair').on(table.memberId, table.contactId)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    policyholderMemberId: uuid('policyholder_member_id')
      .notNull()
      .references(() => members.id),
    scope: text('scope').notNull(),
    status: text('status').notNull().default('active'),
    reference: text('reference'),
    startedOn: date('started_on').notNull(),
    endedOn: date('ended_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [index('subscriptions_policyholder').on(table.policyholderMemberId)],
);

export const subscriptionCoverage = pgTable(
  'subscription_coverage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    addedOn: date('added_on').notNull(),
    removedOn: date('removed_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('subscription_coverage_active')
      .on(table.subscriptionId, table.memberId)
      .where(sql`${table.removedOn} is null`),
    index('subscription_coverage_member').on(table.memberId),
  ],
);

export const shepherdingCalls = pgTable(
  'shepherding_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assignmentId: uuid('assignment_id').notNull(),
    calledOn: date('called_on').notNull(),
    outcome: text('outcome').notNull(),
    stillInChurch: text('still_in_church').notNull().default('unknown'),
    feedback: text('feedback'),
    issue: text('issue'),
    recordedBy: text('recorded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('shepherding_calls_assignment').on(table.assignmentId, table.calledOn),
    index('shepherding_calls_called_on').on(table.calledOn),
  ],
);
