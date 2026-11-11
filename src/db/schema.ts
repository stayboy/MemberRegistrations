import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
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
    membershipCardNo: text('membership_card_no'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (table) => [
    uniqueIndex('members_member_no_ci').on(sql`lower(${table.memberNo})`),
    uniqueIndex('members_membership_card_no_ci')
      .on(sql`lower(${table.membershipCardNo})`)
      .where(sql`${table.membershipCardNo} is not null`),
  ],
);

export const eventSeries = pgTable(
  'event_series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    ministryId: uuid('ministry_id').references(() => ministries.id),
    presbyterOnly: boolean('presbyter_only').notNull().default(false),
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

export const subscriptionProducts = pgTable(
  'subscription_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    premiumMinor: bigint('premium_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    active: boolean('active').notNull().default(true),
    paymentMode: text('payment_mode').notNull(),
    periodMonths: integer('period_months').notNull(),
    covers: text('covers').notNull(),
    maxDependents: integer('max_dependents').notNull().default(0),
    allowedRelationships: text('allowed_relationships')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    minMembershipDays: integer('min_membership_days').notNull().default(0),
    requiresCard: boolean('requires_card').notNull().default(false),
    requiresVerified: boolean('requires_verified').notNull().default(false),
    gender: text('gender'),
    minAge: integer('min_age'),
    maxAge: integer('max_age'),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('subscription_products_code_ci').on(sql`lower(${table.code})`)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind'),
    productId: uuid('product_id').references(() => subscriptionProducts.id),
    policyholderMemberId: uuid('policyholder_member_id')
      .notNull()
      .references(() => members.id),
    scope: text('scope').notNull(),
    status: text('status').notNull().default('active'),
    paidBy: text('paid_by'),
    premiumMinor: bigint('premium_minor', { mode: 'number' }),
    reference: text('reference'),
    startedOn: date('started_on').notNull(),
    endedOn: date('ended_on'),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table) => [index('subscriptions_policyholder').on(table.policyholderMemberId)],
);

export const subscriptionPayments = pgTable(
  'subscription_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    channel: text('channel').notNull(),
    reference: text('reference').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    recordedBy: text('recorded_by').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('subscription_payments_period').on(table.subscriptionId, table.periodStart),
    uniqueIndex('subscription_payments_reference').on(table.reference),
    uniqueIndex('subscription_payments_idempotency').on(table.idempotencyKey),
  ],
);

export const subscriptionClaims = pgTable(
  'subscription_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull(),
    recordedBy: text('recorded_by').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('subscription_claims_subscription').on(table.subscriptionId, table.recordedAt, table.id),
  ],
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

/**
 * Provider correlation and the append-only headcount observations. The
 * machine still keys sessions by the internal uuid; `externalId` is the
 * gateway's SESSIONID when an adapter supplies one.
 */
export const ussdSessions = pgTable(
  'ussd_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phoneHash: text('phone_hash').notNull(),
    memberId: uuid('member_id').references(() => members.id),
    anonymous: boolean('anonymous').notNull(),
    state: text('state').notNull(),
    context: jsonb('context')
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastInputSeq: integer('last_input_seq').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    provider: text('provider').notNull().default('hmac'),
    externalId: text('external_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ussd_sessions_phone_hash').on(table.phoneHash),
    index('ussd_sessions_expires_at').on(table.expiresAt),
    uniqueIndex('ussd_sessions_provider_external_id')
      .on(table.provider, table.externalId)
      .where(sql`${table.externalId} is not null`),
  ],
);

/**
 * The raw-SQL repository still owns event_instances; this partial mirror only
 * types the headcount foreign key. It is deliberately not in the drift test's
 * table list because the raw engine owns the rest of the row, including
 * `presbyter_only`, which must not look ORM-owned.
 */
export const eventInstances = pgTable('event_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
});

export const eventSessionHeadcounts = pgTable(
  'event_session_headcounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventInstanceId: uuid('event_instance_id')
      .notNull()
      .references(() => eventInstances.id),
    sessionDate: date('session_date').notNull(),
    asOf: timestamp('as_of', { withTimezone: true }).notNull(),
    mode: text('mode').notNull(),
    adultMale: integer('adult_male').notNull().default(0),
    adultFemale: integer('adult_female').notNull().default(0),
    adultUnspecified: integer('adult_unspecified').notNull().default(0),
    childMale: integer('child_male').notNull().default(0),
    childFemale: integer('child_female').notNull().default(0),
    childUnspecified: integer('child_unspecified').notNull().default(0),
    total: integer('total').notNull(),
    ended: boolean('ended').notNull().default(false),
    recordedBy: text('recorded_by').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    supersedesId: uuid('supersedes_id'),
  },
  (table) => [
    uniqueIndex('event_session_headcounts_supersedes')
      .on(table.supersedesId)
      .where(sql`${table.supersedesId} is not null`),
    index('event_session_headcounts_session').on(table.eventInstanceId, table.sessionDate),
  ],
);

/**
 * The offerings engine owns the full `offerings` row; this partial mirror only
 * types the offering-count foreign key and is not in the drift test's list.
 */
export const offerings = pgTable('offerings', {
  id: uuid('id').primaryKey().defaultRandom(),
});

export const eventSessionOfferingCounts = pgTable(
  'event_session_offering_counts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventInstanceId: uuid('event_instance_id')
      .notNull()
      .references(() => eventInstances.id),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => offerings.id),
    sessionDate: date('session_date').notNull(),
    currency: text('currency').notNull(),
    termsVersion: integer('terms_version').notNull(),
    asOf: timestamp('as_of', { withTimezone: true }).notNull(),
    recordedBy: text('recorded_by').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    supersedesId: uuid('supersedes_id').references(
      (): AnyPgColumn => eventSessionOfferingCounts.id,
    ),
  },
  (table) => [
    uniqueIndex('event_session_offering_counts_supersedes')
      .on(table.supersedesId)
      .where(sql`${table.supersedesId} is not null`),
    index('event_session_offering_counts_group').on(
      table.eventInstanceId,
      table.offeringId,
      table.sessionDate,
    ),
  ],
);

export const eventSessionOfferingCountLines = pgTable(
  'event_session_offering_count_lines',
  {
    countId: uuid('count_id')
      .notNull()
      .references(() => eventSessionOfferingCounts.id, { onDelete: 'cascade' }),
    denominationMinor: bigint('denomination_minor', { mode: 'number' }).notNull(),
    pieces: integer('pieces').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.countId, table.denominationMinor] }),
    check(
      'event_session_offering_count_lines_denomination_positive',
      sql`${table.denominationMinor} > 0`,
    ),
    check('event_session_offering_count_lines_pieces_positive', sql`${table.pieces} > 0`),
  ],
);
