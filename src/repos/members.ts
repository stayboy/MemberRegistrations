import { and, eq, isNull, sql } from 'drizzle-orm';
import { ConflictError, NotFoundError, ValidationError } from '../errors/domain-errors.js';
import { summariseAttendance, type AttendanceCounts } from '../domain/attendance.js';
import { assertDate, normalizeContactValue, type ContactKind } from '../domain/contacts.js';
import { seriesStart, todayIn } from '../domain/series.js';
import type { Db, DbClient, Row } from '../db/sql.js';
import {
  memberContactLinks,
  memberContacts,
  members,
  subscriptionCoverage,
  subscriptions as subscriptionsTable,
} from '../db/schema.js';
import { sqlState } from '../errors/sqlstate.js';
import { loadContacts, type ContactDto } from './contacts.js';
import { loadCalendar, resolveSeriesOccurrences } from './occurrences.js';

export const GENDERS = ['male', 'female', 'other', 'undisclosed'] as const;
export type Gender = (typeof GENDERS)[number];

export const RELATIONSHIP_TYPES = ['spouse', 'parent', 'child', 'guardian', 'other'] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const SUBSCRIPTION_KINDS = ['life_insurance', 'credit_union'] as const;
export type SubscriptionKind = (typeof SUBSCRIPTION_KINDS)[number];

export interface SubscriptionDto {
  id: string;
  kind: SubscriptionKind;
  scope: 'individual' | 'household';
  status: 'active' | 'ended';
  reference: string | null;
  startedOn: string;
  endedOn: string | null;
  role: 'policyholder' | 'covered';
  policyholderMemberNo: string;
  coveredMemberNos: string[];
}

export interface MinistryDto {
  code: string;
  name: string;
}

export interface RelationshipDto {
  id: string;
  type: RelationshipType;
  isDependent: boolean;
  memberNo: string;
  name: string;
  archived: boolean;
}

export interface AttendanceEntryDto {
  id: string;
  date: string;
  source: 'import' | 'manual';
}

export interface AttendanceSeriesDto extends AttendanceCounts {
  seriesId: string;
  seriesName: string;
  ministry: string | null;
  entries: AttendanceEntryDto[];
}

export interface MemberSummary {
  memberNo: string;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  gender: Gender;
  placeOfResidence: string | null;
  joinedOn: string | null;
  isPresbyter: boolean;
  archivedAt: string | null;
  contacts: ContactDto[];
  ministries: MinistryDto[];
}

export interface MemberDetail extends MemberSummary {
  id: string;
  maidenName: string | null;
  alias: string | null;
  dob: string | null;
  addressLine: string | null;
  purgedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  subscriptions: SubscriptionDto[];
  relationships: RelationshipDto[];
  attendance: AttendanceSeriesDto[];
}

export interface ContactInput {
  kind: ContactKind;
  value: string;
  displayOrder?: number;
}

export interface CreateMemberInput {
  memberNo: string;
  firstName: string;
  lastName: string;
  otherNames?: string | null;
  maidenName?: string | null;
  alias?: string | null;
  dob?: string | null;
  gender?: Gender;
  placeOfResidence?: string | null;
  addressLine?: string | null;
  joinedOn?: string | null;
  isPresbyter?: boolean;
  contacts?: ContactInput[];
  ministries?: string[];
}

export type UpdateMemberInput = Partial<
  Omit<CreateMemberInput, 'memberNo' | 'contacts' | 'ministries'>
>;

export interface ListQuery {
  q?: string;
  contact?: string;
  includeArchived?: boolean;
  limit?: number;
  cursor?: string;
}

export interface SubscriptionInput {
  kind: SubscriptionKind;
  scope: 'individual' | 'household';
  reference?: string | null;
  startedOn?: string;
  coveredMemberNos?: string[];
}

interface MemberRow extends Row {
  id: string;
  member_no: string;
  first_name: string | null;
  last_name: string | null;
  other_names: string | null;
  maiden_name: string | null;
  alias: string | null;
  dob: string | null;
  gender: Gender;
  place_of_residence: string | null;
  address_line: string | null;
  joined_on: string | null;
  is_presbyter: boolean;
  archived_at: Date | string | null;
  purged_at: Date | string | null;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

const MEMBER_NO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

/** Aliases keep the snake_case `MemberRow` shape the raw queries returned. */
const memberColumns = {
  id: members.id,
  member_no: members.memberNo,
  first_name: members.firstName,
  last_name: members.lastName,
  other_names: members.otherNames,
  maiden_name: members.maidenName,
  alias: members.alias,
  dob: members.dob,
  gender: members.gender,
  place_of_residence: members.placeOfResidence,
  address_line: members.addressLine,
  joined_on: members.joinedOn,
  is_presbyter: members.isPresbyter,
  archived_at: members.archivedAt,
  purged_at: members.purgedAt,
  version: members.version,
  created_at: members.createdAt,
  updated_at: members.updatedAt,
} as const;

type Statement = ReturnType<typeof sql>;

type MemberSet = Partial<
  Omit<typeof members.$inferInsert, 'version' | 'updatedAt' | 'updatedBy'>
> & {
  version: Statement;
  updatedAt: Statement;
  updatedBy: string;
};

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function isoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function requiredText(value: string | null | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new ValidationError(`${field} is required`);
  return trimmed;
}

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function assertMemberNo(value: string): string {
  if (!MEMBER_NO_PATTERN.test(value)) {
    throw new ValidationError(
      'memberNo must be 1-32 characters and contain only letters, digits, hyphens or underscores',
    );
  }
  return value;
}

/** Bumps the optimistic-concurrency version after any change to the aggregate. */
async function touch(client: DbClient, memberId: string, actor: string): Promise<void> {
  await client.query(
    'update members set version = version + 1, updated_at = now(), updated_by = $2 where id = $1',
    [memberId, actor],
  );
}

export class MemberRepository {
  constructor(private readonly db: Db) {}

  async list(query: ListQuery): Promise<{ items: MemberSummary[]; nextCursor?: string }> {
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const params: unknown[] = [];
    const where: string[] = [];

    if (!query.includeArchived) {
      where.push('m.archived_at is null and m.purged_at is null');
    }

    if (query.q) {
      params.push(`%${query.q}%`);
      const p = `$${params.length}`;
      where.push(`(
        m.member_no ilike ${p} or m.first_name ilike ${p} or m.last_name ilike ${p}
        or m.other_names ilike ${p} or m.alias ilike ${p} or m.maiden_name ilike ${p}
        or exists (select 1 from member_contacts c where c.member_id = m.id and c.value ilike ${p})
        or exists (
          select 1 from member_contact_links l join member_contacts c on c.id = l.contact_id
          where l.member_id = m.id and c.value ilike ${p}
        )
      )`);
    }

    if (query.contact) {
      const normalized = new Set<string>();
      for (const kind of ['phone', 'whatsapp', 'email'] as const) {
        try {
          normalized.add(normalizeContactValue(kind, query.contact));
        } catch {
          // Not a valid value for this channel; try the next one.
        }
      }
      if (normalized.size === 0) {
        throw new ValidationError('contact must be a phone number or email address');
      }

      params.push([...normalized]);
      const p = `$${params.length}`;
      where.push(`(
        exists (select 1 from member_contacts c where c.member_id = m.id and c.normalized_value = any(${p}::text[]))
        or exists (
          select 1 from member_contact_links l join member_contacts c on c.id = l.contact_id
          where l.member_id = m.id and c.normalized_value = any(${p}::text[])
        )
      )`);
    }

    if (query.cursor) {
      params.push(query.cursor);
      where.push(`lower(m.member_no) > lower($${params.length})`);
    }

    params.push(limit + 1);
    const rows = await this.db.query<MemberRow>(
      `select m.* from members m
       ${where.length ? `where ${where.join(' and ')}` : ''}
       order by lower(m.member_no) asc
       limit $${params.length}`,
      params,
    );

    const page = rows.slice(0, limit);
    const items = await this.toSummaries(page);

    return {
      items,
      ...(rows.length > limit ? { nextCursor: page[page.length - 1]?.member_no } : {}),
    };
  }

  async get(memberNo: string, includeArchived = false): Promise<MemberDetail | null> {
    const row = await this.findRow(memberNo, includeArchived);
    return row ? this.toDetail(row) : null;
  }

  async create(input: CreateMemberInput, actor: string): Promise<MemberDetail> {
    const memberNo = assertMemberNo(requiredText(input.memberNo, 'memberNo'));
    const gender = input.gender ?? 'undisclosed';
    if (!GENDERS.includes(gender)) throw new ValidationError('gender is not recognised');
    const joinedOn = input.joinedOn ? assertDate(input.joinedOn, 'joinedOn') : todayIn('UTC');
    const dob = input.dob ? assertDate(input.dob, 'dob') : null;

    try {
      const id = await this.db.transaction(async (tx) => {
        const [row] = await tx.orm
          .insert(members)
          .values({
            memberNo,
            firstName: requiredText(input.firstName, 'firstName'),
            lastName: requiredText(input.lastName, 'lastName'),
            otherNames: optionalText(input.otherNames),
            maidenName: optionalText(input.maidenName),
            alias: optionalText(input.alias),
            dob,
            gender,
            placeOfResidence: optionalText(input.placeOfResidence),
            addressLine: optionalText(input.addressLine),
            joinedOn,
            isPresbyter: input.isPresbyter ?? false,
            createdBy: actor,
            updatedBy: actor,
          })
          .returning({ id: members.id });

        for (const [index, contact] of (input.contacts ?? []).entries()) {
          await this.insertContact(tx, row!.id, contact, index);
        }
        for (const code of input.ministries ?? []) {
          await this.assignMinistryTx(tx, row!.id, code);
        }
        return row!.id;
      });

      const detail = await this.findById(id);
      return detail!;
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(`A member with number ${memberNo} already exists`);
      }
      throw error;
    }
  }

  async update(
    memberNo: string,
    input: UpdateMemberInput,
    actor: string,
    expectedVersion?: number,
  ): Promise<MemberDetail> {
    const row = await this.requireRow(memberNo);

    if (input.isPresbyter === false && row.is_presbyter) {
      const [active] = await this.db.query<{ count: number }>(
        `select count(*)::int as count from shepherding_assignments
         where officer_member_id = $1 and ended_on is null`,
        [row.id],
      );
      if ((active?.count ?? 0) > 0) {
        throw new ConflictError(
          `Member ${memberNo} still shepherds ${active!.count} member(s); reassign them before clearing the presbyter flag`,
        );
      }
    }

    const fields: Partial<
      Omit<typeof members.$inferInsert, 'version' | 'updatedAt' | 'updatedBy'>
    > = {};

    if (input.firstName !== undefined) {
      fields.firstName = requiredText(input.firstName, 'firstName');
    }
    if (input.lastName !== undefined) {
      fields.lastName = requiredText(input.lastName, 'lastName');
    }
    if (input.otherNames !== undefined) fields.otherNames = input.otherNames;
    if (input.maidenName !== undefined) fields.maidenName = input.maidenName;
    if (input.alias !== undefined) fields.alias = input.alias;
    if (input.dob !== undefined) {
      fields.dob = input.dob ? assertDate(input.dob, 'dob') : null;
    }
    if (input.gender !== undefined) {
      if (!GENDERS.includes(input.gender)) {
        throw new ValidationError('gender is not recognised');
      }
      fields.gender = input.gender;
    }
    if (input.placeOfResidence !== undefined) fields.placeOfResidence = input.placeOfResidence;
    if (input.addressLine !== undefined) fields.addressLine = input.addressLine;
    if (input.joinedOn !== undefined) {
      fields.joinedOn = input.joinedOn ? assertDate(input.joinedOn, 'joinedOn') : null;
    }
    if (input.isPresbyter !== undefined) fields.isPresbyter = input.isPresbyter;

    if (Object.keys(fields).length === 0) throw new ValidationError('No fields to update');

    const set: MemberSet = {
      ...fields,
      version: sql`${members.version} + 1`,
      updatedAt: sql`now()`,
      updatedBy: actor,
    };

    const updated = await this.db.orm
      .update(members)
      .set(set)
      .where(and(eq(members.id, row.id), eq(members.version, expectedVersion ?? row.version)))
      .returning({ id: members.id });

    if (updated.length === 0) {
      throw new ConflictError('The member was modified since the supplied ETag');
    }

    const detail = await this.findById(row.id);
    return detail!;
  }

  async archive(memberNo: string, actor: string): Promise<void> {
    const row = await this.requireRow(memberNo);

    const [active] = await this.db.query<{ count: number }>(
      `select count(*)::int as count from shepherding_assignments
       where officer_member_id = $1 and ended_on is null`,
      [row.id],
    );
    if ((active?.count ?? 0) > 0) {
      throw new ConflictError(
        `Member ${memberNo} still shepherds ${active!.count} member(s); reassign them before archiving`,
      );
    }

    await this.db.transaction(async (tx) => {
      // Archiving the sheep ends their assignment; history stays readable.
      await tx.query(
        `update shepherding_assignments
         set ended_on = $2, ended_by = $3, ended_reason = 'member archived'
         where member_id = $1 and ended_on is null`,
        [row.id, todayIn('UTC'), actor],
      );
      await tx.orm
        .update(members)
        .set({
          archivedAt: sql`now()`,
          version: sql`${members.version} + 1`,
          updatedAt: sql`now()`,
          updatedBy: actor,
        })
        .where(eq(members.id, row.id));
    });
  }

  async restore(memberNo: string, actor: string): Promise<MemberDetail> {
    const rows = await this.db.orm
      .update(members)
      .set({
        archivedAt: null,
        version: sql`${members.version} + 1`,
        updatedAt: sql`now()`,
        updatedBy: actor,
      })
      .where(
        and(
          sql`lower(${members.memberNo}) = lower(${memberNo})`,
          sql`${members.archivedAt} is not null`,
          isNull(members.purgedAt),
        ),
      )
      .returning({ id: members.id });
    if (rows.length === 0) {
      throw new ConflictError(`Member ${memberNo} is not archived, or does not exist`);
    }
    const detail = await this.findById(rows[0]!.id);
    return detail!;
  }

  async purge(memberNo: string, confirmation: string, actor: string): Promise<void> {
    if (confirmation !== memberNo) {
      throw new ValidationError('confirmation must repeat the member number exactly');
    }
    const row = await this.findAnyRow(memberNo);
    if (!row) throw new NotFoundError(`Member ${memberNo} was not found`);
    if (row.purged_at) throw new ConflictError(`Member ${memberNo} has already been purged`);

    await this.db.transaction(async (tx) => {
      await tx.query('delete from member_contact_links where member_id = $1', [row.id]);
      await tx.query('delete from member_contacts where member_id = $1', [row.id]);
      await tx.query('delete from subscription_coverage where member_id = $1', [row.id]);
      await tx.query('delete from subscriptions where policyholder_member_id = $1', [row.id]);
      await tx.query(
        'delete from member_relationships where member_id = $1 or related_member_id = $1',
        [row.id],
      );
      await tx.query('delete from member_ministries where member_id = $1', [row.id]);
      // Assignments are never deleted normally; purge is PII erasure, and the
      // cascade removes their calls too.
      await tx.query(
        'delete from shepherding_assignments where officer_member_id = $1 or member_id = $1',
        [row.id],
      );
      await tx.query('delete from attendance_suppressions where member_id = $1', [row.id]);
      await tx.query('delete from attendance where member_id = $1', [row.id]);
      await tx.orm
        .update(members)
        .set({
          firstName: null,
          lastName: null,
          otherNames: null,
          maidenName: null,
          alias: null,
          dob: null,
          placeOfResidence: null,
          addressLine: null,
          gender: 'undisclosed',
          isPresbyter: false,
          archivedAt: sql`now()`,
          purgedAt: sql`now()`,
          version: sql`${members.version} + 1`,
          updatedAt: sql`now()`,
          updatedBy: actor,
        })
        .where(eq(members.id, row.id));
    });
  }

  // -- contacts ------------------------------------------------------------

  async addContact(memberNo: string, input: ContactInput, actor: string): Promise<ContactDto> {
    const row = await this.requireRow(memberNo);
    const id = await this.db.transaction(async (tx) => {
      const contact = await this.insertContact(tx, row.id, input);
      await touch(tx, row.id, actor);
      return contact.id;
    });
    const contacts = await this.contactsFor(row.id);
    return contacts.find((contact) => contact.id === id)!;
  }

  async updateContact(
    memberNo: string,
    contactId: string,
    input: Partial<ContactInput>,
    actor: string,
  ): Promise<ContactDto> {
    const row = await this.requireRow(memberNo);
    const [existing] = await this.db.query<{
      kind: ContactKind;
      value: string;
      display_order: number;
    }>('select kind, value, display_order from member_contacts where id = $1 and member_id = $2', [
      contactId,
      row.id,
    ]);
    if (!existing) throw new NotFoundError(`Contact ${contactId} was not found`);

    const kind = input.kind ?? existing.kind;
    const value = input.value ?? existing.value;
    const normalized = normalizeContactValue(kind, value);

    try {
      await this.db.transaction(async (tx) => {
        await tx.orm
          .update(memberContacts)
          .set({
            kind,
            value: value.trim(),
            normalizedValue: normalized,
            displayOrder: input.displayOrder ?? existing.display_order,
            updatedAt: sql`now()`,
          })
          .where(eq(memberContacts.id, contactId));
        await touch(tx, row.id, actor);
      });
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(`Contact value "${value}" already belongs to a member`);
      }
      throw error;
    }

    const contacts = await this.contactsFor(row.id);
    return contacts.find((contact) => contact.id === contactId)!;
  }

  async removeContact(memberNo: string, contactId: string, actor: string): Promise<void> {
    const row = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      const deleted = await tx.orm
        .delete(memberContacts)
        .where(and(eq(memberContacts.id, contactId), eq(memberContacts.memberId, row.id)))
        .returning({ id: memberContacts.id });
      if (deleted.length === 0) {
        throw new NotFoundError(`Contact ${contactId} was not found on member ${memberNo}`);
      }
      await touch(tx, row.id, actor);
    });
  }

  async linkContact(memberNo: string, contactId: string, actor: string): Promise<ContactDto> {
    const row = await this.requireRow(memberNo);
    const [contact] = await this.db.query<{ member_id: string }>(
      'select member_id from member_contacts where id = $1',
      [contactId],
    );
    if (!contact) throw new NotFoundError(`Contact ${contactId} was not found`);
    if (contact.member_id === row.id) {
      throw new ConflictError('A member already owns this contact');
    }

    try {
      await this.db.transaction(async (tx) => {
        const [next] = await tx.query<{ next: number }>(
          'select coalesce(max(display_order), 0) + 1 as next from member_contact_links where member_id = $1',
          [row.id],
        );
        await tx.orm.insert(memberContactLinks).values({
          memberId: row.id,
          contactId,
          displayOrder: next!.next,
        });
        await touch(tx, row.id, actor);
      });
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError('This contact is already linked to the member');
      }
      throw error;
    }

    const contacts = await this.contactsFor(row.id);
    return contacts.find((item) => item.id === contactId)!;
  }

  async unlinkContact(memberNo: string, contactId: string, actor: string): Promise<void> {
    const row = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      const deleted = await tx.orm
        .delete(memberContactLinks)
        .where(
          and(eq(memberContactLinks.memberId, row.id), eq(memberContactLinks.contactId, contactId)),
        )
        .returning({ id: memberContactLinks.id });
      if (deleted.length === 0) throw new NotFoundError('This contact is not linked to the member');
      await touch(tx, row.id, actor);
    });
  }

  // -- subscriptions -------------------------------------------------------

  async addSubscription(
    memberNo: string,
    input: SubscriptionInput,
    actor: string,
  ): Promise<SubscriptionDto> {
    const row = await this.requireRow(memberNo);
    const startedOn = input.startedOn ? assertDate(input.startedOn, 'startedOn') : todayIn('UTC');

    const subscriptionId = await this.db.transaction(async (tx) => {
      const [created] = await tx.orm
        .insert(subscriptionsTable)
        .values({
          kind: input.kind,
          policyholderMemberId: row.id,
          scope: input.scope,
          reference: optionalText(input.reference),
          startedOn,
          createdBy: actor,
        })
        .returning({ id: subscriptionsTable.id });

      const covered = input.scope === 'household' ? (input.coveredMemberNos ?? []) : [];
      for (const memberNoToCover of covered) {
        const [coveredRow] = await tx.query<{ id: string }>(
          'select id from members where lower(member_no) = lower($1) and purged_at is null',
          [memberNoToCover],
        );
        if (!coveredRow) throw new NotFoundError(`Member ${memberNoToCover} was not found`);
        await this.insertCoverage(tx, created!.id, coveredRow.id, startedOn);
      }

      await touch(tx, row.id, actor);
      return created!.id;
    });

    const subscriptions = await this.subscriptionsFor(row.id);
    return subscriptions.find((item) => item.id === subscriptionId)!;
  }

  async endSubscription(memberNo: string, subscriptionId: string, actor: string): Promise<void> {
    const row = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      const updated = await tx.orm
        .update(subscriptionsTable)
        .set({
          status: 'ended',
          endedOn: sql`coalesce(${subscriptionsTable.endedOn}, ${todayIn('UTC')}::date)`,
        })
        .where(
          and(
            eq(subscriptionsTable.id, subscriptionId),
            eq(subscriptionsTable.policyholderMemberId, row.id),
            eq(subscriptionsTable.status, 'active'),
          ),
        )
        .returning({ id: subscriptionsTable.id });
      if (updated.length === 0) throw new NotFoundError('Active subscription was not found');
      await touch(tx, row.id, actor);
    });
  }

  async addCoverage(subscriptionId: string, memberNo: string, actor: string): Promise<void> {
    const [subscription] = await this.db.query<{ policyholder_member_id: string; scope: string }>(
      'select policyholder_member_id, scope from subscriptions where id = $1 and status = $2',
      [subscriptionId, 'active'],
    );
    if (!subscription) throw new NotFoundError(`Subscription ${subscriptionId} was not found`);
    if (subscription.scope !== 'household') {
      throw new ValidationError('Coverage can only be added to a household subscription');
    }

    const covered = await this.requireRow(memberNo);
    try {
      await this.db.transaction(async (tx) => {
        await this.insertCoverage(tx, subscriptionId, covered.id, todayIn('UTC'));
        await touch(tx, subscription.policyholder_member_id, actor);
        await touch(tx, covered.id, actor);
      });
    } catch (error) {
      if (sqlState(error) === '23505') throw new ConflictError('Member is already covered');
      throw error;
    }
  }

  async removeCoverage(subscriptionId: string, memberNo: string, actor: string): Promise<void> {
    const covered = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      const updated = await tx.orm
        .update(subscriptionCoverage)
        .set({ removedOn: todayIn('UTC') })
        .where(
          and(
            eq(subscriptionCoverage.subscriptionId, subscriptionId),
            eq(subscriptionCoverage.memberId, covered.id),
            isNull(subscriptionCoverage.removedOn),
          ),
        )
        .returning({ id: subscriptionCoverage.id });
      if (updated.length === 0) throw new NotFoundError('Coverage was not found');
      await touch(tx, covered.id, actor);
    });
  }

  // -- ministries ----------------------------------------------------------

  async assignMinistry(memberNo: string, code: string, actor: string): Promise<MinistryDto> {
    const row = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      await this.assignMinistryTx(tx, row.id, code);
      await touch(tx, row.id, actor);
    });
    const ministries = await this.ministriesFor(row.id);
    return ministries.find((ministry) => ministry.code === code.toUpperCase())!;
  }

  async removeMinistry(memberNo: string, code: string, actor: string): Promise<void> {
    const row = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      const deleted = await tx.query(
        `delete from member_ministries mm using ministries mi
         where mm.ministry_id = mi.id and mm.member_id = $1 and lower(mi.code) = lower($2)
         returning mm.ministry_id`,
        [row.id, code],
      );
      if (deleted.length === 0) throw new NotFoundError(`Member does not serve in ${code}`);
      await touch(tx, row.id, actor);
    });
  }

  // -- relationships -------------------------------------------------------

  async addRelationship(
    memberNo: string,
    input: { relatedMemberNo: string; type: RelationshipType; isDependent?: boolean },
    actor: string,
  ): Promise<RelationshipDto> {
    const row = await this.requireRow(memberNo);
    if (!RELATIONSHIP_TYPES.includes(input.type)) {
      throw new ValidationError('relationship type is not recognised');
    }
    const related = await this.requireRow(input.relatedMemberNo);
    if (related.id === row.id) throw new ValidationError('A member cannot be related to itself');

    try {
      await this.db.transaction(async (tx) => {
        await tx.query(
          `insert into member_relationships (member_id, related_member_id, type, is_dependent, created_by)
           values ($1,$2,$3,$4,$5)`,
          [row.id, related.id, input.type, input.isDependent ?? false, actor],
        );
        await touch(tx, row.id, actor);
        await touch(tx, related.id, actor);
      });
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(
          'This relationship already exists, or the member already has a spouse',
        );
      }
      throw error;
    }

    const relationships = await this.relationshipsFor(row.id);
    return relationships.find((item) => item.memberNo === related.member_no)!;
  }

  async removeRelationship(memberNo: string, relationshipId: string, actor: string): Promise<void> {
    const row = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      const deleted = await tx.query<{ member_id: string; related_member_id: string }>(
        `delete from member_relationships
         where id = $1 and (member_id = $2 or related_member_id = $2)
         returning member_id, related_member_id`,
        [relationshipId, row.id],
      );
      if (deleted.length === 0) throw new NotFoundError('Relationship was not found');
      await touch(tx, deleted[0]!.member_id, actor);
      await touch(tx, deleted[0]!.related_member_id, actor);
    });
  }

  // -- attendance ----------------------------------------------------------

  async getAttendance(memberNo: string): Promise<AttendanceSeriesDto[]> {
    const row = await this.requireRow(memberNo);
    return this.attendanceFor(row);
  }

  async recordAttendance(
    memberNo: string,
    input: { seriesId: string; date: string },
    actor: string,
  ): Promise<AttendanceEntryDto> {
    const row = await this.requireRow(memberNo);
    const date = assertDate(input.date);

    const [series] = await this.db.query<{ name: string; timezone: string }>(
      'select name, timezone from event_series where id = $1 and archived_at is null',
      [input.seriesId],
    );
    if (!series) throw new NotFoundError(`Series ${input.seriesId} was not found`);

    const occurrences = await resolveSeriesOccurrences(this.db, input.seriesId, date, date);
    if (!occurrences.includes(date)) {
      throw new ValidationError(`${date} was not a held occurrence of ${series.name}`);
    }

    try {
      const eventInstanceId = await this.db.transaction(async (tx) => {
        const [instance] = await tx.query<{ id: string }>(
          `insert into event_instances (
             series_id, start_date, end_date, name, timezone, venue_type, status, source, sessions
           )
           select s.id, $2, $2, s.name, s.timezone, 'auditorium', 'scheduled', 'series',
                  jsonb_build_array(jsonb_build_object('date', $2::date, 'startTime', null, 'endTime', null, 'status', 'scheduled'))
           from event_series s where s.id = $1
           on conflict (series_id, start_date) do update set start_date = excluded.start_date
           returning id`,
          [input.seriesId, date],
        );
        await tx.query(
          `insert into attendance (member_id, event_instance_id, session_date, source, created_by)
           values ($1,$2,$3,'manual',$4)`,
          [row.id, instance!.id, date, actor],
        );
        await tx.query(
          'delete from attendance_suppressions where member_id = $1 and event_instance_id = $2 and session_date = $3',
          [row.id, instance!.id, date],
        );
        await touch(tx, row.id, actor);
        return instance!.id;
      });

      const [entry] = await this.db.query<{
        id: string;
        session_date: string;
        source: 'import' | 'manual';
      }>(
        'select id, session_date, source from attendance where member_id = $1 and event_instance_id = $2 and session_date = $3',
        [row.id, eventInstanceId, date],
      );

      return { id: entry!.id, date: isoDate(entry!.session_date)!, source: entry!.source };
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(`Attendance for ${date} is already recorded`);
      }
      throw error;
    }
  }

  async deleteAttendance(memberNo: string, attendanceId: string, actor: string): Promise<void> {
    const row = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      const [entry] = await tx.query<{
        event_instance_id: string;
        session_date: string;
        source: 'import' | 'manual';
      }>(
        'select event_instance_id, session_date, source from attendance where id = $1 and member_id = $2',
        [attendanceId, row.id],
      );
      if (!entry) throw new NotFoundError(`Attendance ${attendanceId} was not found`);

      await tx.query('delete from attendance where id = $1', [attendanceId]);

      if (entry.source === 'import') {
        await tx.query(
          `insert into attendance_suppressions (member_id, event_instance_id, session_date, suppressed_by)
           values ($1,$2,$3,$4) on conflict do nothing`,
          [row.id, entry.event_instance_id, entry.session_date, actor],
        );
      }

      await touch(tx, row.id, actor);
    });
  }

  // -- internals -----------------------------------------------------------

  async findRow(memberNo: string, includeArchived: boolean): Promise<MemberRow | null> {
    const where = includeArchived
      ? and(sql`lower(${members.memberNo}) = lower(${memberNo})`, isNull(members.purgedAt))
      : and(
          sql`lower(${members.memberNo}) = lower(${memberNo})`,
          isNull(members.purgedAt),
          isNull(members.archivedAt),
        );
    const [row] = await this.db.orm.select(memberColumns).from(members).where(where).limit(1);
    return (row as MemberRow) ?? null;
  }

  /** Purge has to see its own tombstone to answer "already purged". */
  private async findAnyRow(memberNo: string): Promise<MemberRow | null> {
    const [row] = await this.db.orm
      .select(memberColumns)
      .from(members)
      .where(sql`lower(${members.memberNo}) = lower(${memberNo})`)
      .limit(1);
    return (row as MemberRow) ?? null;
  }

  async requireRow(memberNo: string): Promise<MemberRow> {
    const row = await this.findRow(memberNo, false);
    if (!row) throw new NotFoundError(`Member ${memberNo} was not found`);
    return row;
  }

  private async findById(id: string): Promise<MemberDetail | null> {
    const [row] = await this.db.orm
      .select(memberColumns)
      .from(members)
      .where(eq(members.id, id))
      .limit(1);
    return row ? this.toDetail(row as MemberRow) : null;
  }

  private async toSummaries(rows: MemberRow[]): Promise<MemberSummary[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const contacts = await this.contactsForMany(ids);
    const ministries = await this.ministriesForMany(ids);
    return rows.map((row) =>
      this.toSummary(row, contacts.get(row.id) ?? [], ministries.get(row.id) ?? []),
    );
  }

  private toSummary(
    row: MemberRow,
    contacts: ContactDto[],
    ministries: MinistryDto[],
  ): MemberSummary {
    return {
      memberNo: row.member_no,
      firstName: row.first_name ?? '',
      lastName: row.last_name ?? '',
      otherNames: row.other_names,
      gender: row.gender,
      placeOfResidence: row.place_of_residence,
      joinedOn: isoDate(row.joined_on),
      isPresbyter: row.is_presbyter,
      archivedAt: isoTimestamp(row.archived_at),
      contacts,
      ministries,
    };
  }

  private async toDetail(row: MemberRow): Promise<MemberDetail> {
    const [contacts, subscriptions, ministries, relationships, attendance] = await Promise.all([
      this.contactsFor(row.id),
      this.subscriptionsFor(row.id),
      this.ministriesFor(row.id),
      this.relationshipsFor(row.id),
      this.attendanceFor(row),
    ]);

    return {
      ...this.toSummary(row, contacts, ministries),
      id: row.id,
      maidenName: row.maiden_name,
      alias: row.alias,
      dob: isoDate(row.dob),
      addressLine: row.address_line,
      purgedAt: isoTimestamp(row.purged_at),
      version: row.version,
      createdAt: isoTimestamp(row.created_at)!,
      updatedAt: isoTimestamp(row.updated_at)!,
      subscriptions,
      relationships,
      attendance,
    };
  }

  private async contactsFor(memberId: string): Promise<ContactDto[]> {
    return (await this.contactsForMany([memberId])).get(memberId) ?? [];
  }

  private async contactsForMany(memberIds: string[]): Promise<Map<string, ContactDto[]>> {
    return loadContacts(this.db, memberIds);
  }

  private async ministriesFor(memberId: string): Promise<MinistryDto[]> {
    return (await this.ministriesForMany([memberId])).get(memberId) ?? [];
  }

  private async ministriesForMany(memberIds: string[]): Promise<Map<string, MinistryDto[]>> {
    const rows = await this.db.query<{
      member_id: string;
      code: string;
      name: string;
    }>(
      `select mm.member_id, mi.code, mi.name
       from member_ministries mm
       join ministries mi on mi.id = mm.ministry_id
       where mm.member_id = any($1::uuid[])
       order by mi.code`,
      [memberIds],
    );

    const map = new Map<string, MinistryDto[]>();
    for (const row of rows) {
      const list = map.get(row.member_id) ?? [];
      list.push({ code: row.code, name: row.name });
      map.set(row.member_id, list);
    }
    return map;
  }

  private async subscriptionsFor(memberId: string): Promise<SubscriptionDto[]> {
    const rows = await this.db.query<{
      id: string;
      kind: SubscriptionKind;
      scope: 'individual' | 'household';
      status: 'active' | 'ended';
      reference: string | null;
      started_on: string;
      ended_on: string | null;
      policyholder_member_id: string;
      policyholder_member_no: string;
      covered: string[];
    }>(
      `select s.id, s.kind, s.scope, s.status, s.reference, s.started_on, s.ended_on,
              s.policyholder_member_id, holder.member_no as policyholder_member_no,
              coalesce((
                select array_agg(covered.member_no order by covered.member_no)
                from subscription_coverage sc
                join members covered on covered.id = sc.member_id
                where sc.subscription_id = s.id and sc.removed_on is null
              ), '{}') as covered
       from subscriptions s
       join members holder on holder.id = s.policyholder_member_id
       where s.policyholder_member_id = $1
          or exists (
            select 1 from subscription_coverage sc
            where sc.subscription_id = s.id and sc.member_id = $1 and sc.removed_on is null
          )
       order by s.kind, s.started_on`,
      [memberId],
    );

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      scope: row.scope,
      status: row.status,
      reference: row.reference,
      startedOn: isoDate(row.started_on)!,
      endedOn: isoDate(row.ended_on),
      role: row.policyholder_member_id === memberId ? 'policyholder' : 'covered',
      policyholderMemberNo: row.policyholder_member_no,
      coveredMemberNos: row.covered,
    }));
  }

  private async relationshipsFor(memberId: string): Promise<RelationshipDto[]> {
    const rows = await this.db.query<{
      id: string;
      type: RelationshipType;
      is_dependent: boolean;
      other_member_no: string;
      first_name: string | null;
      last_name: string | null;
      archived_at: Date | string | null;
    }>(
      `select r.id, r.type, r.is_dependent, other.member_no as other_member_no,
              other.first_name, other.last_name, other.archived_at
       from member_relationships r
       join members other
         on other.id = case when r.member_id = $1 then r.related_member_id else r.member_id end
       where r.member_id = $1 or r.related_member_id = $1
       order by r.created_at`,
      [memberId],
    );

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      isDependent: row.is_dependent,
      memberNo: row.other_member_no,
      name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      archived: row.archived_at !== null,
    }));
  }

  private async attendanceFor(row: MemberRow): Promise<AttendanceSeriesDto[]> {
    const series = await this.db.query<{
      id: string;
      name: string;
      timezone: string;
      ministry: string | null;
    }>(
      `select distinct s.id, s.name, s.timezone, mi.name as ministry
       from event_series s
       left join ministries mi on mi.id = s.ministry_id
       where s.archived_at is null
         and (
           exists (
              select 1 from attendance a
              join event_instances e on e.id = a.event_instance_id
              where e.series_id = s.id and a.member_id = $1
            )
           or exists (
             select 1 from member_ministries mm
             where mm.member_id = $1 and mm.ministry_id = s.ministry_id
           )
         )
       order by s.name`,
      [row.id],
    );

    const attended = await this.db.query<{
      id: string;
      series_id: string;
      session_date: string;
      source: 'import' | 'manual';
    }>(
      `select a.id, e.series_id, a.session_date, a.source
         from attendance a join event_instances e on e.id = a.event_instance_id
        where a.member_id = $1`,
      [row.id],
    );

    const bySeries = new Map<string, AttendanceEntryDto[]>();
    for (const entry of attended) {
      const list = bySeries.get(entry.series_id) ?? [];
      list.push({ id: entry.id, date: isoDate(entry.session_date)!, source: entry.source });
      bySeries.set(entry.series_id, list);
    }

    const result: AttendanceSeriesDto[] = [];
    for (const item of series) {
      const calendar = await loadCalendar(this.db, item.id);
      const start = seriesStart(calendar.schedules);
      if (!start) continue;

      const endsOn = calendar.schedules[calendar.schedules.length - 1]?.endsOn ?? null;
      const today = todayIn(item.timezone);
      const joinedOn = isoDate(row.joined_on);
      const windowStart = joinedOn && joinedOn > start ? joinedOn : start;
      const windowEnd = endsOn && endsOn < today ? endsOn : today;
      if (windowStart > windowEnd) continue;

      const occurrences = await resolveSeriesOccurrences(this.db, item.id, windowStart, windowEnd);
      const entries = (bySeries.get(item.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
      const counts = summariseAttendance({
        occurrences,
        attendedDates: entries
          .map((entry) => entry.date)
          .filter((date) => date >= windowStart && date <= windowEnd),
        endsOn,
        today,
      });

      result.push({
        seriesId: item.id,
        seriesName: item.name,
        ministry: item.ministry,
        ...counts,
        entries,
      });
    }

    return result;
  }

  private async insertContact(
    tx: DbClient,
    memberId: string,
    input: ContactInput,
    fallbackOrder?: number,
  ): Promise<{ id: string }> {
    const normalized = normalizeContactValue(input.kind, input.value);
    const order =
      input.displayOrder ??
      fallbackOrder ??
      (
        await tx.query<{ next: number }>(
          'select coalesce(max(display_order), 0) + 1 as next from member_contacts where member_id = $1',
          [memberId],
        )
      )[0]!.next;

    try {
      const [row] = await tx.orm
        .insert(memberContacts)
        .values({
          memberId,
          kind: input.kind,
          value: input.value.trim(),
          normalizedValue: normalized,
          displayOrder: order,
        })
        .returning({ id: memberContacts.id });
      return row!;
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(`Contact value "${input.value}" already belongs to a member`);
      }
      throw error;
    }
  }

  private async assignMinistryTx(tx: DbClient, memberId: string, code: string): Promise<void> {
    const [ministry] = await tx.query<{ id: string }>(
      'select id from ministries where lower(code) = lower($1) and active',
      [code],
    );
    if (!ministry) throw new NotFoundError(`Ministry ${code} was not found or is inactive`);

    try {
      await tx.query(
        'insert into member_ministries (member_id, ministry_id, assigned_on) values ($1,$2,$3)',
        [memberId, ministry.id, todayIn('UTC')],
      );
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(`Member already serves in ${code}`);
      }
      throw error;
    }
  }

  private async insertCoverage(
    tx: DbClient,
    subscriptionId: string,
    memberId: string,
    addedOn: string,
  ): Promise<void> {
    await tx.orm.insert(subscriptionCoverage).values({ subscriptionId, memberId, addedOn });
  }
}
