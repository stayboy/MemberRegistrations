import type { Db, Row } from '../db/sql.js';
import { ageInYears } from '../domain/age.js';
import { todayIn } from '../domain/series.js';
import {
  ConflictError,
  InvalidAmountError,
  NotFoundError,
  ValidationError,
} from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import type { Gender } from '../domain/member-types.js';
import {
  COVERS,
  PAYMENT_MODES,
  PERIOD_MONTHS,
  type CreateSubscriptionProductInput,
  type SubscriptionProductDto,
} from '../schemas/subscription-products.js';

interface ProductRow extends Row {
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
}

/** The member fields an eligibility rule reads. */
export interface EligibilityMember {
  joinedOn: string | null;
  membershipCardNo: string | null;
  verifiedAt: string | null;
  gender: Gender;
  dob: string | null;
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

function productFromRow(row: ProductRow): SubscriptionProductDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    premiumMinor: Number(row.premium_minor),
    currency: row.currency,
    active: row.active,
    paymentMode: row.payment_mode as SubscriptionProductDto['paymentMode'],
    periodMonths: Number(row.period_months) as SubscriptionProductDto['periodMonths'],
    covers: row.covers as SubscriptionProductDto['covers'],
    maxDependents: Number(row.max_dependents),
    allowedRelationships: parseArray(
      row.allowed_relationships,
    ) as SubscriptionProductDto['allowedRelationships'],
    minMembershipDays: Number(row.min_membership_days),
    requiresCard: row.requires_card,
    requiresVerified: row.requires_verified,
    gender: row.gender as SubscriptionProductDto['gender'],
    minAge: row.min_age === null ? null : Number(row.min_age),
    maxAge: row.max_age === null ? null : Number(row.max_age),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    updatedAt: isoTimestamp(row.updated_at),
    createdAt: isoTimestamp(row.created_at)!,
  };
}

/** Days from `joinedOn` to today (UTC); null when the join date is unknown. */
function membershipDays(joinedOn: string | null, today: string): number | null {
  if (!joinedOn) return null;
  const joined = Date.parse(`${joinedOn}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(joined) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.floor((now - joined) / 86_400_000));
}

/**
 * Server-side product eligibility. Every write path calls this before it
 * touches a subscription; USSD calls it to hide a product rather than refuse.
 */
export function isEligible(
  product: SubscriptionProductDto,
  member: EligibilityMember,
  today = todayIn('UTC'),
): boolean {
  if (!product.active) return false;

  if (product.minMembershipDays > 0) {
    const days = membershipDays(member.joinedOn, today);
    if (days === null || days < product.minMembershipDays) return false;
  }

  if (product.requiresCard && member.membershipCardNo === null) return false;
  if (product.requiresVerified && member.verifiedAt === null) return false;

  if (product.gender !== null && member.gender !== product.gender) return false;

  if (product.minAge !== null || product.maxAge !== null) {
    const age = ageInYears(member.dob, today);
    if (age === null) return false;
    if (product.minAge !== null && age < product.minAge) return false;
    if (product.maxAge !== null && age > product.maxAge) return false;
  }

  return true;
}

export class SubscriptionProductRepository {
  constructor(private readonly db: Db) {}

  async list(options: { includeInactive?: boolean } = {}): Promise<SubscriptionProductDto[]> {
    const rows = await this.db.query<ProductRow>(
      `select * from subscription_products
        ${options.includeInactive ? '' : 'where active'}
        order by lower(code)`,
    );
    return rows.map(productFromRow);
  }

  /** Case-insensitive; returns null rather than throwing. */
  async get(code: string): Promise<SubscriptionProductDto | null> {
    const [row] = await this.db.query<ProductRow>(
      'select * from subscription_products where lower(code) = lower($1)',
      [code.trim()],
    );
    return row ? productFromRow(row) : null;
  }

  async create(
    input: CreateSubscriptionProductInput,
    actor: string,
  ): Promise<SubscriptionProductDto> {
    const code = this.normalise(input);
    try {
      const [row] = await this.db.query<ProductRow>(
        `insert into subscription_products (
           code, name, description, premium_minor, currency, active, payment_mode,
           period_months, covers, max_dependents, allowed_relationships,
           min_membership_days, requires_card, requires_verified, gender, min_age,
           max_age, created_by, updated_by, updated_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18,now())
         returning *`,
        [
          code,
          input.name.trim(),
          input.description?.trim() || null,
          input.premiumMinor,
          input.currency,
          input.active ?? true,
          input.paymentMode,
          input.periodMonths,
          input.covers,
          input.covers === 'household' ? (input.maxDependents ?? 0) : 0,
          input.covers === 'household' ? [...new Set(input.allowedRelationships ?? [])] : [],
          input.minMembershipDays ?? 0,
          input.requiresCard ?? false,
          input.requiresVerified ?? false,
          input.gender ?? null,
          input.minAge ?? null,
          input.maxAge ?? null,
          actor,
        ],
      );
      return productFromRow(row!);
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(`A welfare product with code ${code} already exists`);
      }
      throw error;
    }
  }

  /** Only `active` is mutable; pricing and eligibility are fixed at creation. */
  async setActive(code: string, active: boolean, actor: string): Promise<SubscriptionProductDto> {
    const [row] = await this.db.query<ProductRow>(
      `update subscription_products
          set active = $2, updated_by = $3, updated_at = now()
        where lower(code) = lower($1)
        returning *`,
      [code.trim(), active, actor],
    );
    if (!row) throw new NotFoundError(`Welfare product ${code} was not found`);
    return productFromRow(row);
  }

  private normalise(input: CreateSubscriptionProductInput): string {
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,32}$/.test(code)) {
      throw new ValidationError(
        'code must be 1-32 characters and contain only letters, digits, hyphens or underscores',
      );
    }
    if (!Number.isInteger(input.premiumMinor) || input.premiumMinor <= 0) {
      throw new InvalidAmountError('premiumMinor must be a positive integer in minor units');
    }
    if (!PAYMENT_MODES.includes(input.paymentMode)) {
      throw new ValidationError('paymentMode is not recognised');
    }
    if (!(PERIOD_MONTHS as readonly number[]).includes(input.periodMonths)) {
      throw new ValidationError('periodMonths must be one of 1, 2, 3, 6 or 12');
    }
    if (!COVERS.includes(input.covers)) {
      throw new ValidationError('covers is not recognised');
    }
    if (input.covers === 'household') {
      if (!input.maxDependents || input.maxDependents < 1) {
        throw new ValidationError('a household product requires maxDependents of at least 1');
      }
      if (!input.allowedRelationships || input.allowedRelationships.length === 0) {
        throw new ValidationError('a household product requires at least one allowed relationship');
      }
    }
    if (
      input.minAge !== null &&
      input.minAge !== undefined &&
      input.maxAge !== null &&
      input.maxAge !== undefined &&
      input.minAge > input.maxAge
    ) {
      throw new ValidationError('maxAge must be on or after minAge');
    }
    return code;
  }
}
