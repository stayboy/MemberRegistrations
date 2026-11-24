import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { VerificationDestination } from '../domain/verification.js';
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
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
 * `bytea` has no first-class Drizzle column. The photo is the only binary value
 * in the register; both drivers (pg and PGlite) hand back a `Uint8Array`, so the
 * custom type normalises it to a Buffer behind the repository (MR-14).
 */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType() {
    return 'bytea';
  },
  fromDriver(value) {
    return Buffer.from(value);
  },
});

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

/**
 * The office a presbyter holds. Reference data in `0021_officer_titles`:
 * adding a title is an insert and retiring one is `active = false`, so an
 * existing holder keeps rendering the label it was given.
 */
export const presbyterTitles = pgTable(
  'presbyter_titles',
  {
    code: text('code').primaryKey(),
    label: text('label').notNull(),
    genderRestriction: text('gender_restriction'),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    check(
      'presbyter_titles_gender_restriction_check',
      sql`${table.genderRestriction} in ('male','female')`,
    ),
  ],
);

/** The duty a member carries inside one ministry; the same data-not-code rules apply. */
export const ministryPositions = pgTable('ministry_positions', {
  code: text('code').primaryKey(),
  label: text('label').notNull(),
  active: boolean('active').notNull().default(true),
});

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
    /** UTC date the member joined this assembly; distinct from `joinedOn`. */
    assemblyJoinedOn: date('assembly_joined_on'),
    /** Where the member came from, free text; null when not recorded. */
    cameFrom: text('came_from'),
    /** UTC date the member moved out; null while they are still here. */
    movedOutOn: date('moved_out_on'),
    /** The assembly the member moved to, free text; null when not recorded. */
    movedToAssembly: text('moved_to_assembly'),
    /** The person kind: `visitor` or `active`; archived is `archivedAt` (A-7). */
    membershipStatus: text('membership_status').notNull().default('active'),
    isPresbyter: boolean('is_presbyter').notNull().default(false),
    presbyterRank: integer('presbyter_rank'),
    /** The member's office; nullable and independent of `isPresbyter` (O-4). */
    titleCode: text('title_code').references(() => presbyterTitles.code),
    /** UTC calendar date the office was taken; cleared with the title. */
    titledOn: date('titled_on'),
    membershipCardNo: text('membership_card_no'),
    /** One square photograph per member; null when none is stored (MR-14). */
    photo: bytea('photo'),
    /** The stored media type; null exactly when `photo` is null. */
    photoContentType: text('photo_content_type'),
    /** The instant the current bytes were stored; drives the wire ETag. */
    photoUpdatedAt: timestamp('photo_updated_at', { withTimezone: true }),
    /** Inert history: the officer confirmation audit is the source (MR-52). */
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
    index('members_title')
      .on(table.titleCode)
      .where(sql`${table.titleCode} is not null`),
    check(
      'members_membership_status_check',
      sql`${table.membershipStatus} in ('visitor','active')`,
    ),
    check(
      'members_photo_content_type_check',
      sql`${table.photoContentType} in ('image/webp','image/jpeg','image/png')`,
    ),
  ],
);

/**
 * An audience is reference data: exactly one operator over a flat clause list
 * (A-1). A seeded row is `system = true` and read-only; the combination
 * audiences the migration derives from a legacy ministry + presbyter pair are
 * custom rows so an operator can rename them.
 */
export const audiences = pgTable(
  'audiences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    system: boolean('system').notNull().default(false),
    systemKey: text('system_key'),
    active: boolean('active').notNull().default(true),
    rule: jsonb('rule').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by'),
  },
  (table) => [
    uniqueIndex('audiences_system_key')
      .on(table.systemKey)
      .where(sql`${table.systemKey} is not null`),
    uniqueIndex('audiences_name_ci').on(sql`lower(${table.name})`),
  ],
);

/**
 * The event parent. `ministry_id` and `presbyter_only` are the audience
 * round's read-only legacy projections; `event_audiences` (below) is the
 * applicability, and `audience_id` is the write-only revert shim that mirrors
 * its primary row.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventNo: text('event_no').notNull(),
    name: text('name').notNull(),
    audienceId: uuid('audience_id')
      .notNull()
      .references(() => audiences.id),
    ministryId: uuid('ministry_id').references(() => ministries.id),
    presbyterOnly: boolean('presbyter_only').notNull().default(false),
    timezone: text('timezone').notNull().default('UTC'),
    description: text('description'),
    venueType: text('venue_type').notNull().default('auditorium'),
    venueName: text('venue_name'),
    startTime: text('start_time'),
    endTime: text('end_time'),
    tracksMembers: boolean('tracks_members').notNull().default(true),
    status: text('status').notNull().default('active'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('events_event_no').on(table.eventNo),
    check('events_venue_type_check', sql`${table.venueType} in ('auditorium','virtual','hybrid')`),
    check('events_status_check', sql`${table.status} in ('draft','active','archived')`),
  ],
);

/**
 * The ordered audience set: the only authority for who an event is for
 * (A-2a). The first row is the primary and mirrors into `events.audience_id`.
 */
export const eventAudiences = pgTable(
  'event_audiences',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    audienceId: uuid('audience_id')
      .notNull()
      .references(() => audiences.id),
    sortOrder: integer('sort_order').notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.audienceId] })],
);

export const eventRecurrenceVersions = pgTable(
  'event_recurrence_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    effectiveFrom: date('effective_from').notNull(),
    rrule: text('rrule').notNull(),
    endsOn: date('ends_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    uniqueIndex('event_recurrence_versions_event_effective').on(table.eventId, table.effectiveFrom),
    check(
      'event_recurrence_versions_ends_check',
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.effectiveFrom}`,
    ),
  ],
);

export const eventRecurrenceExceptions = pgTable(
  'event_recurrence_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    kind: text('kind').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    index('event_recurrence_exceptions_lookup').on(table.eventId, table.date, table.createdAt),
    check('event_recurrence_exceptions_kind_check', sql`${table.kind} in ('cancelled','extra')`),
  ],
);

export const eventOccurrences = pgTable(
  'event_occurrences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    startTime: text('start_time'),
    endTime: text('end_time'),
    status: text('status').notNull().default('scheduled'),
    note: text('note'),
    venueType: text('venue_type'),
    legacyEventNo: text('legacy_event_no'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('event_occurrences_event_date').on(table.eventId, table.date),
    index('event_occurrences_event').on(table.eventId),
    check(
      'event_occurrences_status_check',
      sql`${table.status} in ('scheduled','held','cancelled')`,
    ),
    check(
      'event_occurrences_venue_type_check',
      sql`${table.venueType} is null or ${table.venueType} in ('auditorium','virtual','hybrid')`,
    ),
  ],
);

/** Append-only officer promotion of a visitor; the only status action this round. */
export const memberStatusEvents = pgTable(
  'member_status_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    reason: text('reason'),
    actor: text('actor').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('member_status_events_member').on(table.memberId, table.at),
    check('member_status_events_kind_check', sql`${table.kind} in ('promoted')`),
  ],
);

/** Append-only link from a first-time visitor gift's phone hash to the member. */
export const firstTimeVisitorIdentities = pgTable('first_time_visitor_identities', {
  phoneHash: text('phone_hash').primaryKey(),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id),
  linkedBy: text('linked_by').notNull(),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
});

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
    /** Set when a code sent to this one contact was accepted; cleared on a change (MR-26). */
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
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
 * One live verification code per member (MR-25): the HMAC of the six digits, the
 * one masked destination, the contact it binds to and that value's hash (MR-26),
 * the single-use token hash, the expiry and the attempt count. Consumed rows stay
 * for history, and the partial unique index keeps a single live code.
 */
export const memberVerificationCodes = pgTable(
  'member_verification_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    /** `{ channel, masked }`: the wire form, never a delivery address. */
    destination: jsonb('destination').$type<VerificationDestination>().notNull(),
    /** The one contact the code is bound to; a deleted contact leaves it null (MR-26). */
    contactId: uuid('contact_id').references(() => memberContacts.id, {
      onDelete: 'set null',
    }),
    /** The bound value's hash at issue time; `accept` re-checks it (MR-26). */
    destinationValueHash: text('destination_value_hash').notNull(),
    /** SHA-256 of the acceptance-page token; every live code has one (MR-51). */
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('member_verification_codes_live')
      .on(table.memberId)
      .where(sql`${table.consumedAt} is null`),
  ],
);

/**
 * The officer confirmation, append-only (MR-52). A row is active while
 * `withdrawnAt` is null; `confirmedAt` on the member reads the latest active row
 * and never the inert `members.verified_at`.
 */
export const memberConfirmations = pgTable(
  'member_confirmations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    confirmedBy: text('confirmed_by').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull().defaultNow(),
    reason: text('reason').notNull(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    withdrawnBy: text('withdrawn_by'),
  },
  (table) => [index('member_confirmations_member').on(table.memberId, table.confirmedAt)],
);

/**
 * An anonymous USSD registration request. The caller's number is retained
 * encrypted (`phoneEncrypted`, AES-256-GCM under `REGISTRATION_PHONE_KEY`) for
 * approval and erased on the decision; the hash remains for the rate limit
 * (MR-53). No member exists until the request is approved.
 */
export const registrationRequests = pgTable('registration_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: text('reference').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phoneHash: text('phone_hash').notNull(),
  phoneEncrypted: text('phone_encrypted'),
  occurrenceId: uuid('occurrence_id')
    .notNull()
    .references(() => eventOccurrences.id, { onDelete: 'cascade' }),
  /** Kept denormalised from the occurrence for the existing wire. */
  sessionDate: date('session_date').notNull(),
  codeId: uuid('code_id').notNull(),
  status: text('status').notNull().default('pending'),
  memberId: uuid('member_id').references(() => members.id),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedBy: text('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

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
 * Headcount modes are reference data from `0022_headcount_lanes`: adding one is
 * an insert and retiring one is `retired = true`. `mixed` is seeded retired so
 * a legacy observation keeps its label and its lines stay readable.
 */
export const headcountModes = pgTable('headcount_modes', {
  code: text('code').primaryKey(),
  label: text('label').notNull(),
  entryLabel: text('entry_label').notNull(),
  retired: boolean('retired').notNull().default(false),
});

/** A mode arrives with its buckets; the pair is the natural key a line points at. */
export const headcountBuckets = pgTable(
  'headcount_buckets',
  {
    modeCode: text('mode_code')
      .notNull()
      .references(() => headcountModes.code),
    code: text('code').notNull(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (table) => [primaryKey({ columns: [table.modeCode, table.code] })],
);

export const eventSessionHeadcounts = pgTable(
  'event_session_headcounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    occurrenceId: uuid('occurrence_id')
      .notNull()
      .references(() => eventOccurrences.id, { onDelete: 'cascade' }),
    sessionDate: date('session_date').notNull(),
    asOf: timestamp('as_of', { withTimezone: true }).notNull(),
    mode: text('mode')
      .notNull()
      .references(() => headcountModes.code),
    total: integer('total').notNull(),
    ended: boolean('ended').notNull().default(false),
    recordedBy: text('recorded_by').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    supersedesId: uuid('supersedes_id').references((): AnyPgColumn => eventSessionHeadcounts.id),
  },
  (table) => [
    uniqueIndex('event_session_headcounts_supersedes')
      .on(table.supersedesId)
      .where(sql`${table.supersedesId} is not null`),
    index('event_session_headcounts_occurrence').on(table.occurrenceId),
    // No `where supersedes_id is null` unique index: a superseded root keeps
    // that column null, so such an index would guard roots rather than tips.
    // The write path resolves the tip in its transaction with the lane locked
    // (HC-2), and legacy data may hold several tips until the next write (HC-27).
    check('event_session_headcounts_total_check', sql`${table.total} between 0 and 30000`),
  ],
);

/**
 * One line per non-zero bucket of an observation. The bucket is unique only
 * within its mode, so the line carries `mode_code` and the foreign key is the
 * `(mode_code, code)` pair rather than the bare code.
 */
export const headcountLines = pgTable(
  'headcount_lines',
  {
    headcountId: uuid('headcount_id')
      .notNull()
      .references(() => eventSessionHeadcounts.id, { onDelete: 'cascade' }),
    modeCode: text('mode_code').notNull(),
    bucketCode: text('bucket_code').notNull(),
    count: integer('count').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.headcountId, table.bucketCode] }),
    foreignKey({
      columns: [table.modeCode, table.bucketCode],
      foreignColumns: [headcountBuckets.modeCode, headcountBuckets.code],
    }),
    check('headcount_lines_count_check', sql`${table.count} between 0 and 10000`),
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
    occurrenceId: uuid('occurrence_id')
      .notNull()
      .references(() => eventOccurrences.id, { onDelete: 'cascade' }),
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
    index('event_session_offering_counts_occurrence').on(table.occurrenceId, table.offeringId),
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

/**
 * The legacy offering attachment, rekeyed to the event parent during the
 * transition. The session-offerings round replaces it with a per-occurrence
 * `session_offerings` row; until then it stays readable and writable.
 */
export const eventOfferings = pgTable(
  'event_offerings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    /** Null for a series-level or standalone attachment; set for a series-backed instance. */
    occurrenceId: uuid('occurrence_id').references(() => eventOccurrences.id),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => offerings.id),
    availableUntil: date('available_until'),
    attachedOn: timestamp('attached_on', { withTimezone: true }).notNull().defaultNow(),
    attachedBy: text('attached_by').notNull(),
    detachedOn: timestamp('detached_on', { withTimezone: true }),
    detachedBy: text('detached_by'),
  },
  (table) => [
    index('event_offerings_event').on(table.eventId, table.offeringId),
    uniqueIndex('event_offerings_active_occurrence')
      .on(table.offeringId, table.occurrenceId)
      .where(sql`${table.occurrenceId} is not null and ${table.detachedOn} is null`),
    uniqueIndex('event_offerings_active_event')
      .on(table.offeringId, table.eventId)
      .where(sql`${table.occurrenceId} is null and ${table.detachedOn} is null`),
  ],
);
