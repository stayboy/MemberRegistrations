import { randomUUID } from 'node:crypto';
import { todayIn } from '../domain/series.js';
import { generateReference } from '../domain/contributions.js';
import {
  ClaimNotPendingError,
  ConflictError,
  IdempotencyConflictError,
  InvalidAmountError,
  NotFoundError,
  NotCoveredError,
  NotEligibleError,
  PeriodAlreadyPaidError,
  SubscriptionNotActiveError,
  ValidationError,
} from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import type { Db, DbClient, Row } from '../db/sql.js';
import { ageInYears } from '../domain/age.js';
import type { Gender, RelationshipType } from '../domain/member-types.js';
import { isEligible, type EligibilityMember } from './subscription-products.js';
import type { SubscriptionProductDto } from '../schemas/subscription-products.js';
import type {
  DecideClaimInput,
  MemberSubscriptionDto,
  RecordClaimInput,
  RecordPaymentInput,
  SubscribeProductInput,
  SubscriptionClaimDto,
  SubscriptionPaymentDto,
} from '../schemas/subscriptions.js';

export const SUBSCRIPTION_KINDS = ['life_insurance', 'credit_union'] as const;
export type SubscriptionKind = (typeof SUBSCRIPTION_KINDS)[number];

/** The member-detail subscription row; kept for backward compatibility. */
export interface SubscriptionDto {
  id: string;
  kind: SubscriptionKind | null;
  scope: 'individual' | 'household';
  status: 'active' | 'ended';
  reference: string | null;
  startedOn: string;
  endedOn: string | null;
  role: 'policyholder' | 'covered';
  policyholderMemberNo: string;
  coveredMemberNos: string[];
}

type PaymentChannel = 'app' | 'ussd' | 'manual';
type PaidBy = 'member' | 'church';

interface MemberRow extends Row {
  id: string;
  member_no: string;
  first_name: string | null;
  last_name: string | null;
  other_names: string | null;
  gender: Gender;
  dob: string | null;
  joined_on: string | null;
  membership_card_no: string | null;
  verified_at: Date | string | null;
  archived_at: Date | string | null;
  purged_at: Date | string | null;
}

interface SubscriptionRow extends Row {
  id: string;
  kind: string | null;
  product_id: string | null;
  policyholder_member_id: string;
  scope: string;
  status: string;
  paid_by: string | null;
  premium_minor: number | string | null;
  reference: string | null;
  started_on: unknown;
  ended_on: unknown;
  period_start: unknown;
  period_end: unknown;
  created_by: string;
  updated_by: string | null;
  updated_at: unknown;
  created_at: unknown;
  product_code: string | null;
  product_name: string | null;
  product_currency: string | null;
  product_premium: number | string | null;
  product_period_months: number | string | null;
  product_payment_mode: string | null;
  product_covers: string | null;
  product_max_dependents: number | string | null;
  product_allowed_relationships: string[] | string | null;
  product_min_membership_days: number | string | null;
  product_requires_card: boolean | null;
  product_requires_verified: boolean | null;
  product_gender: string | null;
  product_min_age: number | string | null;
  product_max_age: number | string | null;
  product_active: boolean | null;
  holder_member_no: string;
  holder_first_name: string | null;
  holder_last_name: string | null;
  holder_other_names: string | null;
  holder_gender: Gender;
  holder_dob: string | null;
  covered_member_nos: string[] | string | null;
  claimed_total: number | string | null;
}

interface PaymentRow extends Row {
  id: string;
  subscription_id: string;
  period_start: unknown;
  period_end: unknown;
  amount_minor: number | string;
  currency: string;
  channel: string;
  reference: string;
  paid_at: unknown;
  recorded_by: string;
  idempotency_key: string;
  created_at: unknown;
}

interface ClaimRow extends Row {
  id: string;
  subscription_id: string;
  member_no: string;
  member_name: string;
  amount_minor: number | string;
  reason: string;
  status: string;
  recorded_by: string;
  recorded_at: unknown;
  decided_by: string | null;
  decided_at: unknown;
  decision_note: string | null;
  created_at: unknown;
}

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

function isoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function parseArray(value: string[] | string | null): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Calendar months in UTC, clamping a 31st to the shorter target month. */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const total = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return `${nextYear}-${pad(nextMonth)}-${pad(Math.min(day, lastDay))}`;
}

function displayName(row: {
  first_name: string | null;
  last_name: string | null;
  other_names: string | null;
}): string {
  return (
    [row.first_name?.trim(), row.last_name?.trim()].filter(Boolean).join(' ') ||
    (row.other_names?.trim() ?? '')
  );
}

const SUBSCRIPTION_COLUMNS = `
  s.id, s.kind, s.product_id, s.policyholder_member_id, s.scope, s.status,
  s.paid_by, s.premium_minor, s.reference, s.started_on, s.ended_on,
  s.period_start, s.period_end, s.created_by, s.updated_by, s.updated_at,
  s.created_at,
  p.code as product_code, p.name as product_name, p.currency as product_currency,
  p.premium_minor as product_premium, p.period_months as product_period_months,
  p.payment_mode as product_payment_mode, p.covers as product_covers,
  p.max_dependents as product_max_dependents,
  p.allowed_relationships as product_allowed_relationships,
  p.min_membership_days as product_min_membership_days,
  p.requires_card as product_requires_card,
  p.requires_verified as product_requires_verified,
  p.gender as product_gender, p.min_age as product_min_age, p.max_age as product_max_age,
  p.active as product_active,
  holder.member_no as holder_member_no, holder.first_name as holder_first_name,
  holder.last_name as holder_last_name, holder.other_names as holder_other_names,
  holder.gender as holder_gender, holder.dob as holder_dob,
  coalesce((
    select array_agg(covered.member_no order by covered.member_no)
      from subscription_coverage sc
      join members covered on covered.id = sc.member_id
     where sc.subscription_id = s.id and sc.removed_on is null
  ), '{}') as covered_member_nos,
  coalesce((
    select sum(c.amount_minor)
      from subscription_claims c
     where c.subscription_id = s.id and c.status in ('approved', 'paid')
  ), 0) as claimed_total`;

const SUBSCRIPTION_FROM = `
  from subscriptions s
  left join subscription_products p on p.id = s.product_id
  join members holder on holder.id = s.policyholder_member_id`;

const PAYMENT_COLUMNS = `
  id, subscription_id, period_start, period_end, amount_minor, currency, channel,
  reference, paid_at, recorded_by, idempotency_key, created_at`;

const CLAIM_COLUMNS = `
  c.id, c.subscription_id, m.member_no,
  nullif(trim(concat_ws(' ', m.first_name, m.last_name)), '') as member_name,
  c.amount_minor, c.reason, c.status, c.recorded_by, c.recorded_at,
  c.decided_by, c.decided_at, c.decision_note, c.created_at`;

function productFromRow(row: SubscriptionRow): SubscriptionProductDto | null {
  if (row.product_id === null) return null;
  return {
    id: row.product_id,
    code: row.product_code ?? '',
    name: row.product_name ?? '',
    description: null,
    premiumMinor: Number(row.product_premium ?? 0),
    currency: row.product_currency ?? '',
    active: row.product_active ?? false,
    paymentMode: (row.product_payment_mode ?? 'member') as SubscriptionProductDto['paymentMode'],
    periodMonths: Number(row.product_period_months ?? 1) as SubscriptionProductDto['periodMonths'],
    covers: (row.product_covers ?? 'individual') as SubscriptionProductDto['covers'],
    maxDependents: Number(row.product_max_dependents ?? 0),
    allowedRelationships: parseArray(
      row.product_allowed_relationships,
    ) as SubscriptionProductDto['allowedRelationships'],
    minMembershipDays: Number(row.product_min_membership_days ?? 0),
    requiresCard: row.product_requires_card ?? false,
    requiresVerified: row.product_requires_verified ?? false,
    gender: (row.product_gender ?? null) as SubscriptionProductDto['gender'],
    minAge: row.product_min_age === null ? null : Number(row.product_min_age),
    maxAge: row.product_max_age === null ? null : Number(row.product_max_age),
    createdBy: '',
    updatedBy: null,
    updatedAt: null,
    createdAt: '',
  };
}

function eligibilityMember(row: MemberRow): EligibilityMember {
  return {
    joinedOn: isoDate(row.joined_on),
    membershipCardNo: row.membership_card_no,
    verifiedAt: isoTimestamp(row.verified_at),
    gender: row.gender,
    dob: isoDate(row.dob),
  };
}

function paymentFromRow(row: PaymentRow): SubscriptionPaymentDto {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    periodStart: isoDate(row.period_start)!,
    periodEnd: isoDate(row.period_end)!,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    channel: row.channel as PaymentChannel,
    reference: row.reference,
    paidAt: isoTimestamp(row.paid_at)!,
    recordedBy: row.recorded_by,
    idempotencyKey: row.idempotency_key,
    createdAt: isoTimestamp(row.created_at)!,
  };
}

function claimFromRow(row: ClaimRow): SubscriptionClaimDto {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    memberNo: row.member_no,
    memberName: row.member_name,
    amountMinor: Number(row.amount_minor),
    reason: row.reason,
    status: row.status as SubscriptionClaimDto['status'],
    recordedBy: row.recorded_by,
    recordedAt: isoTimestamp(row.recorded_at)!,
    decidedBy: row.decided_by,
    decidedAt: isoTimestamp(row.decided_at),
    decisionNote: row.decision_note,
    createdAt: isoTimestamp(row.created_at)!,
  };
}

/** Invert parent/child when the stored edge is declared from the other side. */
function relationshipInDirection(
  storedType: RelationshipType,
  declaredBySubject: boolean,
): RelationshipType {
  if (declaredBySubject) return storedType;
  if (storedType === 'parent') return 'child';
  if (storedType === 'child') return 'parent';
  return storedType;
}

/** The relationship from the covered member to the policyholder. */
function relationshipFromCovered(
  storedType: RelationshipType,
  declaredByHolder: boolean,
): RelationshipType {
  return relationshipInDirection(storedType, !declaredByHolder);
}

/** The relationship from the policyholder to the covered member; the product rule. */
function relationshipFromHolder(
  storedType: RelationshipType,
  declaredByHolder: boolean,
): RelationshipType {
  return relationshipInDirection(storedType, declaredByHolder);
}

export class SubscriptionRepository {
  constructor(private readonly db: Db) {}

  // -- member reads --------------------------------------------------------

  /**
   * Owned and inherited rows for the member read and USSD "My services".
   * Legacy rows keep their kind and carry null product, payer and period fields.
   */
  async memberSubscriptions(memberNo: string): Promise<MemberSubscriptionDto[]> {
    const member = await this.requireMember(this.db, memberNo);
    const rows = await this.db.query<SubscriptionRow>(
      `select ${SUBSCRIPTION_COLUMNS}
         ${SUBSCRIPTION_FROM}
        where s.policyholder_member_id = $1
           or exists (
             select 1 from subscription_coverage sc
              where sc.subscription_id = s.id
                and sc.member_id = $1
                and sc.removed_on is null
           )
        order by s.started_on, s.created_at, s.id`,
      [member.id],
    );

    const items: MemberSubscriptionDto[] = [];
    for (const row of rows) {
      const owned = row.policyholder_member_id === member.id;
      const relationship = owned
        ? null
        : await this.relationshipFrom(this.db, row.policyholder_member_id, member.id);
      items.push(this.memberSubscriptionFromRow(row, member.id, relationship));
    }

    return items.sort((a, b) => {
      if (a.source !== b.source) return a.source === 'owned' ? -1 : 1;
      const aName = a.productName ?? a.kind ?? '';
      const bName = b.productName ?? b.kind ?? '';
      if (aName !== bName) return aName < bName ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  /** The member-detail shape, delegating to the same projection. */
  async detailSubscriptions(memberId: string): Promise<SubscriptionDto[]> {
    const rows = await this.db.query<SubscriptionRow>(
      `select ${SUBSCRIPTION_COLUMNS}
         ${SUBSCRIPTION_FROM}
        where s.policyholder_member_id = $1
           or exists (
             select 1 from subscription_coverage sc
              where sc.subscription_id = s.id
                and sc.member_id = $1
                and sc.removed_on is null
           )
        order by s.started_on, s.created_at`,
      [memberId],
    );

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as SubscriptionKind | null,
      scope: row.scope as SubscriptionDto['scope'],
      status: row.status as SubscriptionDto['status'],
      reference: row.reference,
      startedOn: isoDate(row.started_on)!,
      endedOn: isoDate(row.ended_on),
      role: row.policyholder_member_id === memberId ? 'policyholder' : 'covered',
      policyholderMemberNo: row.holder_member_no,
      coveredMemberNos: parseArray(row.covered_member_nos),
    }));
  }

  // -- subscribe / renew ---------------------------------------------------

  async subscribe(
    memberNo: string,
    input: SubscribeProductInput,
    actor: string,
    channel: PaymentChannel = 'manual',
  ): Promise<MemberSubscriptionDto> {
    const member = await this.requireMember(this.db, memberNo);
    const today = todayIn('UTC');

    const subscriptionId = await this.db.transaction(async (tx) => {
      const product = await this.requireProduct(tx, input.productCode);
      if (!product.active) {
        throw new NotEligibleError(`Welfare product ${product.code} is not active`);
      }
      this.assertEligible(product, member);

      const paidBy = this.resolvePayer(product, input.paidBy);
      const periodStart = today;
      const periodEnd = addMonths(periodStart, product.periodMonths);
      const premium = paidBy === 'member' ? product.premiumMinor : null;

      const covered = await this.validateCoverage(
        tx,
        product,
        member,
        input.coveredMemberNos ?? [],
      );

      const [created] = await tx.query<{ id: string }>(
        `insert into subscriptions (
           kind, product_id, policyholder_member_id, scope, status, paid_by,
           premium_minor, started_on, period_start, period_end, created_by,
           updated_by, updated_at
         ) values (null,$1,$2,$3,'active',$4,$5,$6,$6,$7,$8,$8,now())
         returning id`,
        [product.id, member.id, product.covers, paidBy, premium, periodStart, periodEnd, actor],
      );

      for (const coveredMember of covered) {
        await this.insertCoverage(tx, created!.id, coveredMember.id, today);
      }

      if (paidBy === 'member') {
        await this.insertPayment(tx, {
          subscriptionId: created!.id,
          periodStart,
          periodEnd,
          amountMinor: product.premiumMinor,
          currency: product.currency,
          channel,
          reference: generateReference(),
          idempotencyKey: `SUB-${randomUUID()}`,
          paidAt: null,
          actor,
        });
      }

      return created!.id;
    });

    return this.readMemberSubscription(subscriptionId, member.id);
  }

  async renew(
    subscriptionId: string,
    input: { paidBy?: PaidBy },
    actor: string,
  ): Promise<MemberSubscriptionDto> {
    const today = todayIn('UTC');
    const memberId = await this.db.transaction(async (tx) => {
      const row = await this.requireSubscription(tx, subscriptionId);
      this.assertActive(row);
      const product = productFromRow(row);
      if (!product) {
        throw new ValidationError('A legacy subscription cannot be renewed through a product');
      }
      const member = await this.requireMemberById(tx, row.policyholder_member_id);
      this.assertEligible(product, member);

      const paidBy = this.resolvePayer(
        product,
        input.paidBy ?? (row.paid_by as PaidBy | null) ?? undefined,
      );
      const periodStart = this.nextPeriodStart(row.period_end, today);
      const periodEnd = addMonths(periodStart, product.periodMonths);
      const premium = paidBy === 'member' ? product.premiumMinor : null;

      await tx.query(
        `update subscriptions
            set paid_by = $2, premium_minor = $3, period_start = $4, period_end = $5,
                updated_by = $6, updated_at = now()
          where id = $1`,
        [subscriptionId, paidBy, premium, periodStart, periodEnd, actor],
      );

      if (paidBy === 'member') {
        await this.insertPayment(tx, {
          subscriptionId,
          periodStart,
          periodEnd,
          amountMinor: product.premiumMinor,
          currency: product.currency,
          channel: 'manual',
          reference: generateReference(),
          idempotencyKey: `RENEW-${randomUUID()}`,
          paidAt: null,
          actor,
        });
      }

      return row.policyholder_member_id;
    });

    return this.readMemberSubscription(subscriptionId, memberId);
  }

  // -- coverage ------------------------------------------------------------

  async addCoverage(subscriptionId: string, memberNo: string, actor: string): Promise<void> {
    const today = todayIn('UTC');
    await this.db.transaction(async (tx) => {
      const row = await this.requireSubscription(tx, subscriptionId);
      this.assertActive(row);
      const product = productFromRow(row);
      const holder = await this.requireMemberById(tx, row.policyholder_member_id);
      const covered = await this.requireCoveredMember(tx, memberNo);
      if (covered.id === holder.id) {
        throw new ValidationError('The policyholder is already covered');
      }
      if (row.scope !== 'household') {
        throw new ValidationError('Coverage can only be added to a household subscription');
      }
      if (product) {
        if (product.covers !== 'household') {
          throw new ValidationError('Coverage can only be added to a household product');
        }
        const count = await this.coverageCount(tx, subscriptionId);
        if (count >= product.maxDependents) {
          throw new ValidationError(
            `This product covers at most ${product.maxDependents} dependent(s)`,
          );
        }
        if (
          !(await this.hasAllowedRelationship(
            tx,
            holder.id,
            covered.id,
            product.allowedRelationships,
          ))
        ) {
          throw new ValidationError(
            `The member is not joined by an allowed relationship (${product.allowedRelationships.join(', ')})`,
          );
        }
      }
      try {
        await this.insertCoverage(tx, subscriptionId, covered.id, today);
      } catch (error) {
        if (sqlState(error) === '23505') {
          throw new ConflictError('Member is already covered');
        }
        throw error;
      }
      await this.touchSubscription(tx, subscriptionId, actor);
    });
  }

  async removeCoverage(subscriptionId: string, memberNo: string, actor: string): Promise<void> {
    const today = todayIn('UTC');
    await this.db.transaction(async (tx) => {
      const subscription = await this.requireSubscription(tx, subscriptionId);
      this.assertActive(subscription);
      const covered = await this.findMemberRow(tx, memberNo);
      const updated = await tx.query<{ id: string }>(
        `update subscription_coverage
            set removed_on = $3
          where subscription_id = $1 and member_id = $2 and removed_on is null
          returning id`,
        [subscriptionId, covered.id, today],
      );
      if (updated.length === 0) {
        throw new NotCoveredError(`Member ${memberNo} is not actively covered`);
      }
      await this.touchSubscription(tx, subscriptionId, actor);
    });
  }

  // -- payments ------------------------------------------------------------

  async listPayments(subscriptionId: string): Promise<SubscriptionPaymentDto[]> {
    await this.requireSubscription(this.db, subscriptionId);
    const rows = await this.db.query<PaymentRow>(
      `select ${PAYMENT_COLUMNS}
         from subscription_payments
        where subscription_id = $1
        order by period_start, created_at`,
      [subscriptionId],
    );
    return rows.map(paymentFromRow);
  }

  async recordPayment(
    subscriptionId: string,
    input: RecordPaymentInput,
    actor: string,
  ): Promise<{ created: boolean; payment: SubscriptionPaymentDto }> {
    const today = todayIn('UTC');

    const existing = await this.findPaymentByKey(this.db, input.idempotencyKey);
    if (existing) {
      return { created: false, payment: this.samePaymentOrThrow(existing, subscriptionId, input) };
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await this.db.transaction(async (tx) => {
          const row = await this.requireSubscription(tx, subscriptionId);
          this.assertActive(row);
          const product = productFromRow(row);
          if (!product) {
            throw new ValidationError('A legacy subscription does not take product payments');
          }
          const member = await this.requireMemberById(tx, row.policyholder_member_id);
          this.assertEligible(product, member);

          if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
            throw new InvalidAmountError('amountMinor must be a positive integer in minor units');
          }
          if (input.currency !== product.currency) {
            throw new ValidationError(
              `currency ${input.currency} does not match the subscription currency ${product.currency}`,
            );
          }
          const periodEnd = isoDate(row.period_end);
          if (periodEnd !== null && periodEnd >= today) {
            throw new PeriodAlreadyPaidError(
              `The period to ${periodEnd} is already paid; there is no unpaid period to record`,
            );
          }

          const periodStart = today;
          const nextEnd = addMonths(periodStart, product.periodMonths);
          const [inserted] = await tx.query<PaymentRow>(
            `insert into subscription_payments (
               subscription_id, period_start, period_end, amount_minor, currency, channel,
               reference, paid_at, recorded_by, idempotency_key
             ) values ($1,$2,$3,$4,$5,$6,$7,coalesce($8::timestamptz, now()),$9,$10)
             returning ${PAYMENT_COLUMNS}`,
            [
              subscriptionId,
              periodStart,
              nextEnd,
              input.amountMinor,
              input.currency,
              input.channel,
              input.reference ?? generateReference(),
              input.paidAt ?? null,
              actor,
              input.idempotencyKey,
            ],
          );

          await tx.query(
            `update subscriptions
                set paid_by = 'member', premium_minor = $2, period_start = $3,
                    period_end = $4, updated_by = $5, updated_at = now()
              where id = $1`,
            [subscriptionId, input.amountMinor, periodStart, nextEnd, actor],
          );

          return paymentFromRow(inserted!);
        });

        return { created: true, payment: result };
      } catch (error) {
        if (sqlState(error) === '23505') {
          const duplicate = await this.findPaymentByKey(this.db, input.idempotencyKey);
          if (duplicate) {
            return {
              created: false,
              payment: this.samePaymentOrThrow(duplicate, subscriptionId, input),
            };
          }
          if (input.reference !== undefined) {
            throw new ConflictError(`Payment reference ${input.reference} is already in use`);
          }
          continue;
        }
        throw error;
      }
    }

    throw new ConflictError('Could not allocate a unique payment reference');
  }

  // -- claims --------------------------------------------------------------

  async listClaims(subscriptionId: string): Promise<SubscriptionClaimDto[]> {
    await this.requireSubscription(this.db, subscriptionId);
    const rows = await this.db.query<ClaimRow>(
      `select ${CLAIM_COLUMNS}
         from subscription_claims c
         join members m on m.id = c.member_id
        where c.subscription_id = $1
        order by c.recorded_at desc, c.id desc`,
      [subscriptionId],
    );
    return rows.map(claimFromRow);
  }

  async recordClaim(
    subscriptionId: string,
    input: RecordClaimInput,
    actor: string,
  ): Promise<SubscriptionClaimDto> {
    return this.db.transaction(async (tx) => {
      const subscription = await this.requireSubscription(tx, subscriptionId);
      this.assertActive(subscription);
      const claimant = await this.requireMember(tx, input.memberNo);
      if (claimant.id !== subscription.policyholder_member_id) {
        const covered = await tx.query<{ id: string }>(
          `select id from subscription_coverage
            where subscription_id = $1 and member_id = $2 and removed_on is null`,
          [subscriptionId, claimant.id],
        );
        if (covered.length === 0) {
          throw new NotCoveredError(`Member ${input.memberNo} is not covered by this subscription`);
        }
      }
      if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
        throw new InvalidAmountError('amountMinor must be a positive integer in minor units');
      }
      const [inserted] = await tx.query<{ id: string }>(
        `insert into subscription_claims (
           subscription_id, member_id, amount_minor, reason, status, recorded_by
         ) values ($1,$2,$3,$4,'pending',$5)
         returning id`,
        [subscriptionId, claimant.id, input.amountMinor, input.reason, actor],
      );
      return this.readClaim(tx, inserted!.id);
    });
  }

  async decideClaim(
    subscriptionId: string,
    claimId: string,
    input: DecideClaimInput,
    actor: string,
  ): Promise<SubscriptionClaimDto> {
    return this.db.transaction(async (tx) => {
      const [claim] = await tx.query<{ status: string; subscription_id: string }>(
        `select status, subscription_id from subscription_claims
          where id = $1 and subscription_id = $2
          for update`,
        [claimId, subscriptionId],
      );
      if (!claim) throw new NotFoundError(`Claim ${claimId} was not found`);
      this.assertActive(await this.requireSubscription(tx, subscriptionId));

      const allowed =
        (claim.status === 'pending' &&
          (input.status === 'approved' || input.status === 'rejected')) ||
        (claim.status === 'approved' && input.status === 'paid');
      if (!allowed) {
        throw new ClaimNotPendingError(
          `Claim ${claimId} is ${claim.status} and cannot move to ${input.status}`,
        );
      }

      await tx.query(
        `update subscription_claims
            set status = $2, decided_by = $3, decided_at = now(), decision_note = $4
          where id = $1`,
        [claimId, input.status, actor, input.note ?? null],
      );
      return this.readClaim(tx, claimId);
    });
  }

  // -- internals -----------------------------------------------------------

  private memberSubscriptionFromRow(
    row: SubscriptionRow,
    memberId: string,
    relationship: RelationshipType | null,
  ): MemberSubscriptionDto {
    const owned = row.policyholder_member_id === memberId;
    const product = productFromRow(row);
    const today = todayIn('UTC');
    const periodEnd = isoDate(row.period_end);
    const status: MemberSubscriptionDto['status'] =
      row.ended_on !== null
        ? 'ended'
        : product !== null && periodEnd !== null && periodEnd < today
          ? 'expired'
          : 'active';

    return {
      id: row.id,
      source: owned ? 'owned' : 'inherited',
      role: owned ? 'policyholder' : 'covered',
      status,
      kind: row.kind,
      productCode: row.product_code,
      productName: row.product_name,
      paidBy: (row.paid_by as PaidBy | null) ?? null,
      premiumMinor: row.premium_minor === null ? null : Number(row.premium_minor),
      currency: row.product_currency,
      periodStart: isoDate(row.period_start),
      periodEnd,
      startedOn: isoDate(row.started_on)!,
      endedOn: isoDate(row.ended_on),
      scope: row.scope as MemberSubscriptionDto['scope'],
      coveredMemberNos: parseArray(row.covered_member_nos),
      claimedTotalMinor: Number(row.claimed_total ?? 0),
      createdBy: row.created_by,
      updatedBy: row.updated_by ?? row.created_by,
      updatedAt: isoTimestamp(row.updated_at) ?? isoTimestamp(row.created_at)!,
      policyholder: owned
        ? null
        : {
            memberNo: row.holder_member_no,
            name: displayName({
              first_name: row.holder_first_name,
              last_name: row.holder_last_name,
              other_names: row.holder_other_names,
            }),
            gender: row.holder_gender,
            age: ageInYears(isoDate(row.holder_dob)),
          },
      relationship,
    };
  }

  private async readMemberSubscription(
    subscriptionId: string,
    memberId: string,
  ): Promise<MemberSubscriptionDto> {
    const [row] = await this.db.query<SubscriptionRow>(
      `select ${SUBSCRIPTION_COLUMNS}
         ${SUBSCRIPTION_FROM}
        where s.id = $1`,
      [subscriptionId],
    );
    if (!row) throw new NotFoundError(`Subscription ${subscriptionId} was not found`);
    return this.memberSubscriptionFromRow(row, memberId, null);
  }

  private async requireProduct(db: DbClient, code: string): Promise<SubscriptionProductDto> {
    const [product] = await db.query<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      premium_minor: number | string;
      currency: string;
      active: boolean;
      payment_mode: string;
      period_months: number | string;
      covers: string;
      max_dependents: number | string;
      allowed_relationships: string[] | string | null;
      min_membership_days: number | string;
      requires_card: boolean;
      requires_verified: boolean;
      gender: string | null;
      min_age: number | string | null;
      max_age: number | string | null;
      created_by: string;
      updated_by: string | null;
      updated_at: Date | string | null;
      created_at: Date | string;
    }>('select * from subscription_products where lower(code) = lower($1)', [code.trim()]);
    if (!product) throw new NotFoundError(`Welfare product ${code} was not found`);
    return {
      id: product.id,
      code: product.code,
      name: product.name,
      description: product.description,
      premiumMinor: Number(product.premium_minor),
      currency: product.currency,
      active: product.active,
      paymentMode: product.payment_mode as SubscriptionProductDto['paymentMode'],
      periodMonths: Number(product.period_months) as SubscriptionProductDto['periodMonths'],
      covers: product.covers as SubscriptionProductDto['covers'],
      maxDependents: Number(product.max_dependents),
      allowedRelationships: parseArray(
        product.allowed_relationships,
      ) as SubscriptionProductDto['allowedRelationships'],
      minMembershipDays: Number(product.min_membership_days),
      requiresCard: product.requires_card,
      requiresVerified: product.requires_verified,
      gender: product.gender as SubscriptionProductDto['gender'],
      minAge: product.min_age === null ? null : Number(product.min_age),
      maxAge: product.max_age === null ? null : Number(product.max_age),
      createdBy: product.created_by,
      updatedBy: product.updated_by,
      updatedAt: isoTimestamp(product.updated_at),
      createdAt: isoTimestamp(product.created_at)!,
    };
  }

  private async requireSubscription(
    db: DbClient,
    subscriptionId: string,
  ): Promise<SubscriptionRow> {
    const [row] = await db.query<SubscriptionRow>(
      `select ${SUBSCRIPTION_COLUMNS}
         ${SUBSCRIPTION_FROM}
        where s.id = $1`,
      [subscriptionId],
    );
    if (!row) throw new NotFoundError(`Subscription ${subscriptionId} was not found`);
    return row;
  }

  private async requireMember(db: DbClient, memberNo: string): Promise<MemberRow> {
    const [row] = await db.query<MemberRow>(
      `select id, member_no, first_name, last_name, other_names, gender, dob, joined_on,
              membership_card_no, verified_at, archived_at, purged_at
         from members
        where lower(member_no) = lower($1)`,
      [memberNo],
    );
    if (!row || row.archived_at !== null || row.purged_at !== null) {
      throw new NotFoundError(`Member ${memberNo} was not found`);
    }
    return row;
  }

  private async requireMemberById(db: DbClient, memberId: string): Promise<MemberRow> {
    const [row] = await db.query<MemberRow>(
      `select id, member_no, first_name, last_name, other_names, gender, dob, joined_on,
              membership_card_no, verified_at, archived_at, purged_at
         from members
        where id = $1`,
      [memberId],
    );
    if (!row || row.archived_at !== null || row.purged_at !== null) {
      throw new NotFoundError(`Member ${memberId} was not found`);
    }
    return row;
  }

  /** A dependent must exist and be active; an inactive one is a validation failure. */
  private async requireCoveredMember(db: DbClient, memberNo: string): Promise<MemberRow> {
    const row = await this.findMemberRow(db, memberNo);
    if (row.archived_at !== null || row.purged_at !== null) {
      throw new ValidationError(`Member ${memberNo} is not active and cannot be covered`);
    }
    return row;
  }

  /** Removing coverage may target a member that has since been archived. */
  private async findMemberRow(db: DbClient, memberNo: string): Promise<MemberRow> {
    const [row] = await db.query<MemberRow>(
      `select id, member_no, first_name, last_name, other_names, gender, dob, joined_on,
              membership_card_no, verified_at, archived_at, purged_at
         from members
        where lower(member_no) = lower($1)`,
      [memberNo],
    );
    if (!row) throw new NotFoundError(`Member ${memberNo} was not found`);
    return row;
  }

  private assertEligible(product: SubscriptionProductDto, member: MemberRow): void {
    if (!isEligible(product, eligibilityMember(member))) {
      throw new NotEligibleError(
        `Member ${member.member_no} is not eligible for welfare product ${product.code}`,
      );
    }
  }

  private resolvePayer(product: SubscriptionProductDto, requested: PaidBy | undefined): PaidBy {
    if (product.paymentMode === 'member') return 'member';
    if (product.paymentMode === 'church') return 'church';
    if (requested !== 'member' && requested !== 'church') {
      throw new ValidationError(
        `paidBy is required for the ${product.code} product because it can be paid by member or church`,
      );
    }
    return requested;
  }

  private assertActive(row: SubscriptionRow): void {
    if (row.status === 'ended' || row.ended_on !== null) {
      throw new SubscriptionNotActiveError(`Subscription ${(row as { id: string }).id} has ended`);
    }
  }

  private nextPeriodStart(periodEnd: unknown, today: string): string {
    const end = isoDate(periodEnd);
    return end !== null && end > today ? end : today;
  }

  private async validateCoverage(
    db: DbClient,
    product: SubscriptionProductDto,
    holder: MemberRow,
    memberNos: string[],
  ): Promise<MemberRow[]> {
    const unique = [...new Set(memberNos)];
    if (product.covers === 'individual') {
      if (unique.length > 0) {
        throw new ValidationError('An individual product cannot cover dependents');
      }
      return [];
    }
    if (unique.length > product.maxDependents) {
      throw new ValidationError(
        `The ${product.code} product covers at most ${product.maxDependents} dependent(s)`,
      );
    }

    const covered: MemberRow[] = [];
    for (const memberNo of unique) {
      const member = await this.requireCoveredMember(db, memberNo);
      if (member.id === holder.id) {
        throw new ValidationError('The policyholder is already covered');
      }
      if (
        !(await this.hasAllowedRelationship(db, holder.id, member.id, product.allowedRelationships))
      ) {
        throw new ValidationError(
          `Member ${memberNo} is not joined by an allowed relationship (${product.allowedRelationships.join(', ')})`,
        );
      }
      covered.push(member);
    }
    return covered;
  }

  /** Relationship types from the covered member to the policyholder. */
  private async relationshipTypes(
    db: DbClient,
    holderId: string,
    coveredId: string,
  ): Promise<RelationshipType[]> {
    const edges = await this.relationshipEdges(db, holderId, coveredId);
    return edges.map((edge) => edge.normalized);
  }

  /**
   * A product rule is read from the policyholder to the covered member. The
   * stored edge is normalised to that direction and only that type is matched:
   * a `child` edge declared by the covered member normalises to `parent`.
   */
  private async hasAllowedRelationship(
    db: DbClient,
    holderId: string,
    coveredId: string,
    allowed: string[],
  ): Promise<boolean> {
    const edges = await this.relationshipEdges(db, holderId, coveredId);
    return edges.some((edge) => allowed.includes(edge.fromHolder));
  }

  private async relationshipEdges(
    db: DbClient,
    holderId: string,
    coveredId: string,
  ): Promise<
    Array<{
      fromHolder: RelationshipType;
      normalized: RelationshipType;
    }>
  > {
    const rows = await db.query<{ member_id: string; type: RelationshipType }>(
      `select member_id, type
         from member_relationships
        where (member_id = $1 and related_member_id = $2)
           or (member_id = $2 and related_member_id = $1)`,
      [holderId, coveredId],
    );
    return rows.map((row) => ({
      fromHolder: relationshipFromHolder(row.type, row.member_id === holderId),
      normalized: relationshipFromCovered(row.type, row.member_id === holderId),
    }));
  }

  private async relationshipFrom(
    db: DbClient,
    holderId: string,
    coveredId: string,
  ): Promise<RelationshipType | null> {
    const types = await this.relationshipTypes(db, holderId, coveredId);
    return types[0] ?? null;
  }

  private async coverageCount(db: DbClient, subscriptionId: string): Promise<number> {
    const [row] = await db.query<{ count: number | string }>(
      `select count(*)::int as count from subscription_coverage
        where subscription_id = $1 and removed_on is null`,
      [subscriptionId],
    );
    return Number(row?.count ?? 0);
  }

  private async insertCoverage(
    db: DbClient,
    subscriptionId: string,
    memberId: string,
    addedOn: string,
  ): Promise<void> {
    await db.query(
      `insert into subscription_coverage (subscription_id, member_id, added_on)
       values ($1,$2,$3)`,
      [subscriptionId, memberId, addedOn],
    );
  }

  private async touchSubscription(
    db: DbClient,
    subscriptionId: string,
    actor: string,
  ): Promise<void> {
    await db.query('update subscriptions set updated_by = $2, updated_at = now() where id = $1', [
      subscriptionId,
      actor,
    ]);
  }

  private async insertPayment(
    db: DbClient,
    input: {
      subscriptionId: string;
      periodStart: string;
      periodEnd: string;
      amountMinor: number;
      currency: string;
      channel: PaymentChannel;
      reference: string;
      idempotencyKey: string;
      paidAt: string | null;
      actor: string;
    },
  ): Promise<PaymentRow> {
    const [row] = await db.query<PaymentRow>(
      `insert into subscription_payments (
         subscription_id, period_start, period_end, amount_minor, currency, channel,
         reference, paid_at, recorded_by, idempotency_key
       ) values ($1,$2,$3,$4,$5,$6,$7,coalesce($8::timestamptz, now()),$9,$10)
       returning ${PAYMENT_COLUMNS}`,
      [
        input.subscriptionId,
        input.periodStart,
        input.periodEnd,
        input.amountMinor,
        input.currency,
        input.channel,
        input.reference,
        input.paidAt,
        input.actor,
        input.idempotencyKey,
      ],
    );
    return row!;
  }

  private async findPaymentByKey(db: DbClient, idempotencyKey: string): Promise<PaymentRow | null> {
    const [row] = await db.query<PaymentRow>(
      `select ${PAYMENT_COLUMNS}
         from subscription_payments
        where idempotency_key = $1`,
      [idempotencyKey],
    );
    return row ?? null;
  }

  private samePaymentOrThrow(
    stored: PaymentRow,
    subscriptionId: string,
    input: RecordPaymentInput,
  ): SubscriptionPaymentDto {
    const same =
      stored.subscription_id === subscriptionId &&
      Number(stored.amount_minor) === input.amountMinor &&
      stored.currency === input.currency &&
      stored.channel === input.channel &&
      (input.reference === undefined || stored.reference === input.reference);
    if (!same) {
      throw new IdempotencyConflictError(
        `Idempotency key ${input.idempotencyKey} was already used for a different payment`,
      );
    }
    return paymentFromRow(stored);
  }

  private async readClaim(db: DbClient, claimId: string): Promise<SubscriptionClaimDto> {
    const [row] = await db.query<ClaimRow>(
      `select ${CLAIM_COLUMNS}
         from subscription_claims c
         join members m on m.id = c.member_id
        where c.id = $1`,
      [claimId],
    );
    if (!row) throw new NotFoundError(`Claim ${claimId} was not found`);
    return claimFromRow(row);
  }
}
