import type { Db, DbClient } from '../db/sql.js';
import { assertDate } from '../domain/contacts.js';
import { generateReference, hashVisitorPhone } from '../domain/contributions.js';
import {
  ConflictError,
  DomainError,
  IdempotencyConflictError,
  NotFoundError,
  PaymentFailedError,
  PledgeAlreadyTerminalError,
  ValidationError,
} from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import type { PaymentGateway, PaymentItem, PaymentPayer } from '../payments/gateway.js';
import type { ContributionRepository } from './contributions.js';
import type { ContributionItem } from '../schemas/contributions.js';
import type {
  CreatePaymentGroupInput,
  PaymentCallbackInput,
  PaymentGroup,
  PaymentGroupResult,
  PaymentIntent,
} from '../schemas/payment-groups.js';

type PaymentGroupRow = {
  id: string;
  reference: string;
  idempotency_key: string;
  total_minor: number | string;
  currency: string;
  status: string;
  pledge_id: string | null;
  created_at: unknown;
  created_by: string;
};

type PaymentIntentRow = {
  id: string;
  payment_group_id: string;
  gateway: string;
  reference: string;
  status: string;
  raw_callback_hash: string | null;
  created_at: unknown;
  updated_at: unknown;
};

type MemberRow = {
  id: string;
  member_no: string;
  archived_at: unknown;
  purged_at: unknown;
};

type OfferingRow = {
  id: string;
  active: boolean;
  name: string | null;
  purpose: string;
  currency: string | null;
  version: number | string | null;
};

type PledgeRow = {
  id: string;
  member_id: string;
  offering_id: string;
  event_instance_id: string;
  session_date: unknown;
  amount_minor: number | string;
  currency: string;
  status: string;
};

type StoredGroupContributionRow = {
  id: string;
  member_id: string | null;
  visitor_name: string | null;
  visitor_phone_hash: string | null;
  offering_id: string;
  event_instance_id: string;
  session_date: unknown;
  amount_minor: number | string;
  channel: string;
};

/** The canonical request the group idempotency comparison is based on. */
type CanonicalGroup = {
  memberId: string | null;
  visitorName: string | null;
  visitorPhoneHash: string | null;
  eventId: string;
  sessionDate: string | null;
  currency: string;
  channel: string;
  pledgeId: string | null;
  items: Array<{ offeringId: string; amountMinor: number }>;
  totalMinor: number;
};

const GROUP_COLUMNS = `
  id, reference, idempotency_key, total_minor, currency, status, pledge_id,
  created_at, created_by`;

const INTENT_COLUMNS = `
  id, payment_group_id, gateway, reference, status, raw_callback_hash,
  created_at, updated_at`;

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function isoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function groupFromRow(row: PaymentGroupRow): PaymentGroup {
  return {
    id: row.id,
    reference: row.reference,
    idempotencyKey: row.idempotency_key,
    totalMinor: Number(row.total_minor),
    currency: row.currency,
    status: row.status as PaymentGroup['status'],
    pledgeId: row.pledge_id,
    createdAt: isoTimestamp(row.created_at),
    createdBy: row.created_by,
  };
}

function intentFromRow(row: PaymentIntentRow): PaymentIntent {
  return {
    id: row.id,
    paymentGroupId: row.payment_group_id,
    gateway: row.gateway,
    reference: row.reference,
    status: row.status as PaymentIntent['status'],
    rawCallbackHash: row.raw_callback_hash,
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
  };
}

export class PaymentGroupRepository {
  constructor(
    private readonly db: Db,
    private readonly contributions: ContributionRepository,
    private readonly gateway: PaymentGateway,
    private readonly visitorPhonePepper: string,
  ) {}

  async create(input: CreatePaymentGroupInput, actor: string): Promise<PaymentGroupResult> {
    // Idempotency wins over current entity state, exactly as contributions do.
    const memberLookup = input.memberNo ? await this.findMember(this.db, input.memberNo) : null;
    const visitorName = memberLookup ? null : (input.visitorName ?? null);
    const visitorPhoneHash = input.visitorPhone
      ? hashVisitorPhone(input.visitorPhone, this.visitorPhonePepper)
      : null;

    const existing = await this.findByKey(this.db, input.idempotencyKey);
    if (existing) {
      return this.samePayloadOrThrow(this.db, existing, {
        memberId: memberLookup?.id ?? null,
        visitorName,
        visitorPhoneHash,
        eventId: input.eventId,
        sessionDate: input.sessionDate ? assertDate(input.sessionDate, 'sessionDate') : null,
        currency: input.currency ?? existing.currency,
        channel: input.channel,
        pledgeId: input.pledgeId ?? null,
        items: input.items,
        totalMinor: totalOf(input.items),
      });
    }

    // Only a new payment group runs the entity and business checks.
    if (
      input.memberNo &&
      (!memberLookup || memberLookup.archived_at != null || memberLookup.purged_at != null)
    ) {
      throw new NotFoundError(`Member ${input.memberNo} was not found`);
    }
    if (!input.memberNo && (!input.visitorName || !input.visitorPhone)) {
      throw new ValidationError('A visitor payment group requires visitorName and visitorPhone');
    }

    const sessionDate = input.sessionDate
      ? assertDate(input.sessionDate, 'sessionDate')
      : todayUtcDate();
    const resolved = await this.resolveItems(this.db, input.items, input.pledgeId !== undefined);
    const currency = input.currency ?? resolved[0]!.currency;
    if (resolved.some((offering) => offering.currency !== currency)) {
      throw new ValidationError('Every item in a payment group must use the same currency');
    }

    let effectiveEventId = input.eventId;
    let effectiveSessionDate = sessionDate;

    if (input.pledgeId) {
      if (!memberLookup) {
        throw new ValidationError('A pledge redemption requires a member payer');
      }
      const pledge = await this.findPledge(this.db, input.pledgeId);
      if (pledge.status !== 'pending') {
        throw new ValidationError(`Pledge ${input.pledgeId} is ${pledge.status}, not pending`);
      }
      if (pledge.member_id !== memberLookup.id) {
        throw new ValidationError(`Pledge ${input.pledgeId} belongs to another member`);
      }
      if (input.items.length !== 1) {
        throw new ValidationError('A pledge redemption group has exactly one item');
      }
      const item = input.items[0]!;
      if (
        item.offeringId !== pledge.offering_id ||
        item.amountMinor !== Number(pledge.amount_minor)
      ) {
        throw new ValidationError(
          `Pledge ${input.pledgeId} does not match the offering and amount`,
        );
      }
      if (currency !== pledge.currency) {
        throw new ValidationError(
          `currency ${currency} does not match the pledge currency ${pledge.currency}`,
        );
      }
      effectiveEventId = pledge.event_instance_id;
      effectiveSessionDate = isoDate(pledge.session_date) ?? sessionDate;
    }

    const totalMinor = totalOf(input.items);
    const reference = generateReference();
    const payer: PaymentPayer = memberLookup
      ? { memberNo: memberLookup.member_no }
      : { phoneHash: visitorPhoneHash! };
    const gatewayItems: PaymentItem[] = input.items.map((item, index) => ({
      offeringId: item.offeringId,
      name: resolved[index]!.name,
      amountMinor: item.amountMinor,
      termsVersion: resolved[index]!.version,
    }));
    const canonical: CanonicalGroup = {
      memberId: memberLookup?.id ?? null,
      visitorName,
      visitorPhoneHash,
      eventId: effectiveEventId,
      sessionDate: effectiveSessionDate,
      currency,
      channel: input.channel,
      pledgeId: input.pledgeId ?? null,
      items: input.items,
      totalMinor,
    };

    try {
      return await this.db.transaction(async (tx) => {
        const [inserted] = await tx.query<{ id: string }>(
          `insert into payment_groups (
             reference, idempotency_key, total_minor, currency, status, pledge_id, created_by
           ) values ($1,$2,$3,$4,'pending',$5,$6)
           returning id`,
          [reference, input.idempotencyKey, totalMinor, currency, input.pledgeId ?? null, actor],
        );
        const groupId = inserted!.id;

        const contributions: ContributionItem[] = [];
        for (const [index, item] of input.items.entries()) {
          const created = await this.contributions.createWithin(
            tx,
            {
              memberNo: input.memberNo,
              visitorName: input.memberNo ? undefined : input.visitorName,
              visitorPhone: input.memberNo ? undefined : input.visitorPhone,
              offeringId: item.offeringId,
              eventId: effectiveEventId,
              sessionDate: effectiveSessionDate,
              amountMinor: item.amountMinor,
              currency,
              channel: input.channel,
              status: 'initiated',
              idempotencyKey: `${input.idempotencyKey}:${index + 1}`,
            },
            actor,
            {
              paymentGroupId: groupId,
              skipEventGates: input.pledgeId !== undefined,
              allowInactiveOffering: input.pledgeId !== undefined,
            },
          );
          contributions.push(created.contribution);
        }

        try {
          await this.gateway.initiate({
            reference,
            totalMinor,
            currency,
            payer,
            items: gatewayItems,
          });
        } catch (error) {
          throw new PaymentFailedError(
            `The payment gateway rejected ${reference}: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
        }

        const [intent] = await tx.query<PaymentIntentRow>(
          `insert into payment_intents (payment_group_id, gateway, reference, status)
           values ($1,'stub',$2,'initiated')
           returning ${INTENT_COLUMNS}`,
          [groupId, reference],
        );

        return {
          created: true,
          group: groupFromRow(await this.readGroup(tx, groupId)),
          contributions,
          intent: intentFromRow(intent!),
        };
      });
    } catch (error) {
      if (sqlState(error) === '23505') {
        const duplicate = await this.findByKey(this.db, input.idempotencyKey);
        if (duplicate) {
          return this.samePayloadOrThrow(this.db, duplicate, canonical);
        }
      }
      if (error instanceof DomainError) throw error;
      throw new PaymentFailedError(
        `The payment group could not be created: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Idempotent by gateway reference. A callback for an amount or currency that
   * differs from the group writes nothing.
   */
  async handleCallback(
    input: PaymentCallbackInput,
    rawBodyHash: string,
  ): Promise<{ status: 'paid' | 'failed'; duplicate: boolean }> {
    const intent = await this.findIntentByReference(this.db, input.reference);
    if (!intent) {
      throw new NotFoundError(`Payment reference ${input.reference} was not found`);
    }
    const group = await this.readGroup(this.db, intent.payment_group_id);
    if (Number(group.total_minor) !== input.amountMinor || group.currency !== input.currency) {
      throw new ValidationError(
        `Callback amount ${input.amountMinor} ${input.currency} does not match the payment group`,
      );
    }

    return this.db.transaction(async (tx) => {
      const locked = await this.lockIntent(tx, input.reference);
      if (locked.status === input.status) {
        return { status: input.status, duplicate: true };
      }
      if (locked.status !== 'initiated') {
        throw new ConflictError(`Payment intent ${input.reference} is already ${locked.status}`);
      }

      await tx.query(
        `update payment_intents
            set status = $2, raw_callback_hash = $3, updated_at = now()
          where reference = $1`,
        [input.reference, input.status, rawBodyHash],
      );
      await tx.query(`update payment_groups set status = $2 where id = $1`, [
        locked.payment_group_id,
        input.status,
      ]);
      await tx.query(`update contributions set status = $2 where payment_group_id = $1`, [
        locked.payment_group_id,
        input.status,
      ]);

      const lockedGroup = await this.readGroup(tx, locked.payment_group_id);
      if (lockedGroup.pledge_id !== null && input.status === 'paid') {
        await this.applyPledgeRedemption(
          tx,
          lockedGroup.pledge_id,
          lockedGroup.id,
          input.reference,
        );
      }

      return { status: input.status, duplicate: false };
    });
  }

  private async applyPledgeRedemption(
    db: DbClient,
    pledgeId: string,
    paymentGroupId: string,
    reference: string,
  ): Promise<void> {
    const [pledge] = await db.query<{
      id: string;
      status: string;
      settled_contribution_id: string | null;
    }>(
      `select id, status, settled_contribution_id
         from pledges
        where id = $1
        for update`,
      [pledgeId],
    );
    if (!pledge) throw new NotFoundError(`Pledge ${pledgeId} was not found`);

    const [contribution] = await db.query<{ id: string }>(
      `select id
         from contributions
        where payment_group_id = $1
        order by coalesce(
          nullif(reverse(split_part(reverse(idempotency_key), ':', 1)), '')::int,
          0
        )
        limit 1`,
      [paymentGroupId],
    );
    if (!contribution) {
      throw new PaymentFailedError(`Payment group ${paymentGroupId} has no contribution`);
    }

    if (pledge.status === 'pending') {
      await db.query(
        `update pledges
            set status = 'honored', settled_contribution_id = $2
          where id = $1`,
        [pledge.id, contribution.id],
      );
      await db.query(
        `insert into pledge_events (pledge_id, kind, actor)
         values ($1, 'honored', $2)`,
        [pledge.id, `gateway:${reference}`],
      );
      return;
    }

    if (pledge.status === 'honored' && pledge.settled_contribution_id === contribution.id) {
      return;
    }

    throw new PledgeAlreadyTerminalError(
      `Pledge ${pledge.id} is already ${pledge.status} with a different settlement`,
    );
  }

  private async findMember(db: DbClient, memberNo: string): Promise<MemberRow | null> {
    const [row] = await db.query<MemberRow>(
      `select id, member_no, archived_at, purged_at
         from members
        where lower(member_no) = lower($1)`,
      [memberNo],
    );
    return row ?? null;
  }

  private async findPledge(db: DbClient, id: string): Promise<PledgeRow> {
    const [row] = await db.query<PledgeRow>(
      `select id, member_id, offering_id, event_instance_id, session_date,
              amount_minor, currency, status
         from pledges
        where id = $1`,
      [id],
    );
    if (!row) throw new ValidationError(`Pledge ${id} was not found`);
    return row;
  }

  private async resolveItems(
    db: DbClient,
    items: Array<{ offeringId: string; amountMinor: number }>,
    allowInactive = false,
  ): Promise<Array<{ name: string; currency: string; version: number }>> {
    const ids = [...new Set(items.map((item) => item.offeringId))];
    const rows = await db.query<OfferingRow>(
      `select o.id, o.active, t.name, t.purpose, t.currency, t.version
         from offerings o
         left join lateral (
           select name, purpose, currency, version
             from offering_terms t
            where t.offering_id = o.id
            order by t.version desc
            limit 1
         ) t on true
        where o.id = any($1::uuid[])`,
      [ids],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));

    return items.map((item) => {
      const row = byId.get(item.offeringId);
      if (!row) throw new NotFoundError(`Offering ${item.offeringId} was not found`);
      if (!row.active && !allowInactive) {
        throw new ValidationError(
          `Offering ${item.offeringId} is archived and cannot take contributions`,
        );
      }
      if (row.currency === null || row.version === null) {
        throw new NotFoundError(`Offering ${item.offeringId} has no published terms`);
      }
      return {
        name: row.name?.trim() ? row.name.trim() : row.purpose,
        currency: row.currency,
        version: Number(row.version),
      };
    });
  }

  private async findByKey(db: DbClient, idempotencyKey: string): Promise<PaymentGroupRow | null> {
    const [row] = await db.query<PaymentGroupRow>(
      `select ${GROUP_COLUMNS}
         from payment_groups
        where idempotency_key = $1`,
      [idempotencyKey],
    );
    return row ?? null;
  }

  private async readGroup(db: DbClient, id: string): Promise<PaymentGroupRow> {
    const [row] = await db.query<PaymentGroupRow>(
      `select ${GROUP_COLUMNS}
         from payment_groups
        where id = $1`,
      [id],
    );
    if (!row) throw new NotFoundError(`Payment group ${id} was not found`);
    return row;
  }

  private async findIntentByReference(
    db: DbClient,
    reference: string,
  ): Promise<PaymentIntentRow | null> {
    const [row] = await db.query<PaymentIntentRow>(
      `select ${INTENT_COLUMNS}
         from payment_intents
        where reference = $1`,
      [reference],
    );
    return row ?? null;
  }

  private async lockIntent(db: DbClient, reference: string): Promise<PaymentIntentRow> {
    const [row] = await db.query<PaymentIntentRow>(
      `select ${INTENT_COLUMNS}
         from payment_intents
        where reference = $1
        for update`,
      [reference],
    );
    if (!row) throw new NotFoundError(`Payment reference ${reference} was not found`);
    return row;
  }

  private async readIntentOrThrow(db: DbClient, paymentGroupId: string): Promise<PaymentIntent> {
    const [row] = await db.query<PaymentIntentRow>(
      `select ${INTENT_COLUMNS}
         from payment_intents
        where payment_group_id = $1`,
      [paymentGroupId],
    );
    if (!row) throw new NotFoundError(`Payment intent for group ${paymentGroupId} was not found`);
    return intentFromRow(row);
  }

  private async readCanonicalContributions(
    db: DbClient,
    paymentGroupId: string,
  ): Promise<StoredGroupContributionRow[]> {
    return db.query<StoredGroupContributionRow>(
      `select id, member_id, visitor_name, visitor_phone_hash, offering_id,
              event_instance_id, session_date, amount_minor, channel
         from contributions
        where payment_group_id = $1
        order by coalesce(
          nullif(reverse(split_part(reverse(idempotency_key), ':', 1)), '')::int,
          0
        )`,
      [paymentGroupId],
    );
  }

  /** The canonical request: payer, target, currency, channel, pledge and items. */
  private async samePayloadOrThrow(
    db: DbClient,
    stored: PaymentGroupRow,
    expected: CanonicalGroup,
  ): Promise<PaymentGroupResult> {
    const rows = await this.readCanonicalContributions(db, stored.id);
    const group = groupFromRow(stored);
    const samePayer =
      expected.memberId !== null
        ? rows.every(
            (row) =>
              row.member_id === expected.memberId &&
              row.visitor_name === null &&
              row.visitor_phone_hash === null,
          )
        : rows.every(
            (row) =>
              row.member_id === null &&
              row.visitor_name === expected.visitorName &&
              row.visitor_phone_hash === expected.visitorPhoneHash,
          );
    const sameItems =
      rows.length === expected.items.length &&
      rows.every(
        (row, index) =>
          row.offering_id === expected.items[index]!.offeringId &&
          Number(row.amount_minor) === expected.items[index]!.amountMinor,
      );
    const sameTarget =
      expected.pledgeId !== null
        ? true
        : rows.every(
            (row) =>
              row.event_instance_id === expected.eventId &&
              (expected.sessionDate === null || isoDate(row.session_date) === expected.sessionDate),
          );
    const same =
      samePayer &&
      sameItems &&
      sameTarget &&
      group.currency === expected.currency &&
      group.pledgeId === expected.pledgeId &&
      group.totalMinor === expected.totalMinor &&
      rows.every((row) => row.channel === expected.channel);

    if (!same) {
      throw new IdempotencyConflictError(
        `Idempotency key ${stored.idempotency_key} was already used for a different payment group`,
      );
    }

    return {
      created: false,
      group,
      contributions: await this.contributions.listByPaymentGroup(stored.id),
      intent: await this.readIntentOrThrow(db, stored.id),
    };
  }
}

function totalOf(items: Array<{ amountMinor: number }>): number {
  return items.reduce((sum, item) => sum + item.amountMinor, 0);
}
