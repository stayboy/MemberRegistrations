import type {
  ClaimStatus,
  Covers,
  PaymentMode,
  PeriodMonths,
  RelationshipType,
  WelfareClaim,
  WelfareProduct,
} from '../api/welfare';
import type { Gender } from '../api/members';

/**
 * Pure helpers for the welfare Products and Claims pages. The constraints
 * mirror `createSubscriptionProductSchema` and `recordClaimSchema`.
 */

export function formatMoneyMinor(amountMinor: number, currency: string): string {
  const amount = Number.isFinite(amountMinor) ? amountMinor / 100 : 0;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function paymentModeLabel(mode: PaymentMode): string {
  if (mode === 'member') return 'Member pays';
  if (mode === 'church') return 'Church pays';
  return 'Member or church';
}

export function coversLabel(covers: Covers): string {
  return covers === 'household' ? 'Household' : 'Individual';
}

export function periodLabel(months: PeriodMonths): string {
  return `${months} ${months === 1 ? 'month' : 'months'}`;
}

export function relationshipLabel(type: RelationshipType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function claimStatusLabel(status: ClaimStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function claimTotalMinor(claims: readonly WelfareClaim[]): number {
  return claims
    .filter((claim) => claim.status === 'approved' || claim.status === 'paid')
    .reduce((total, claim) => total + claim.amountMinor, 0);
}

export interface ProductEligibilityLine {
  readonly text: string;
}

/** One readable line per eligibility rule; an empty list means no restriction. */
export function productEligibility(product: WelfareProduct): string[] {
  const lines: string[] = [];
  if (product.minMembershipDays > 0) {
    lines.push(`Member for at least ${product.minMembershipDays} days`);
  }
  if (product.requiresCard) lines.push('Membership card on file');
  if (product.requiresVerified) lines.push('Verified member');
  if (product.gender) lines.push(`Gender: ${product.gender}`);
  if (product.minAge !== null) lines.push(`Minimum age ${product.minAge}`);
  if (product.maxAge !== null) lines.push(`Maximum age ${product.maxAge}`);
  return lines;
}

export function productDependentsLabel(product: WelfareProduct): string {
  if (product.covers === 'individual') return 'No dependents';
  const allowed = product.allowedRelationships.map(relationshipLabel).join(', ');
  return `${product.maxDependents} · ${allowed || 'no relationships'}`;
}

export interface ProductFormValues {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly premiumMinor: string;
  readonly currency: string;
  readonly active: boolean;
  readonly minMembershipDays: string;
  readonly requiresCard: boolean;
  readonly requiresVerified: boolean;
  readonly gender: Gender | '';
  readonly minAge: string;
  readonly maxAge: string;
  readonly paymentMode: PaymentMode;
  readonly periodMonths: PeriodMonths;
  readonly covers: Covers;
  readonly maxDependents: string;
  readonly allowedRelationships: readonly RelationshipType[];
}

export type ProductFormField =
  | 'code'
  | 'name'
  | 'premiumMinor'
  | 'currency'
  | 'minMembershipDays'
  | 'minAge'
  | 'maxAge'
  | 'maxDependents'
  | 'allowedRelationships';

export type ProductFormErrors = Partial<Record<ProductFormField, string>>;

export function createEmptyProductForm(): ProductFormValues {
  return {
    code: '',
    name: '',
    description: '',
    premiumMinor: '',
    currency: 'GHS',
    active: true,
    minMembershipDays: '0',
    requiresCard: false,
    requiresVerified: false,
    gender: '',
    minAge: '',
    maxAge: '',
    paymentMode: 'member',
    periodMonths: 12,
    covers: 'individual',
    maxDependents: '0',
    allowedRelationships: [],
  };
}

function wholeNumber(value: string, allowEmpty: boolean): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return allowEmpty ? null : NaN;
  if (!/^\d+$/.test(trimmed)) return NaN;
  return Number(trimmed);
}

const CODE_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** The client-side mirror of `createSubscriptionProductSchema`. */
export function validateProductForm(values: ProductFormValues): ProductFormErrors {
  const errors: ProductFormErrors = {};

  if (!CODE_PATTERN.test(values.code.trim())) {
    errors.code = 'Code must be 1-32 letters, digits, hyphens or underscores.';
  }
  if (values.name.trim().length === 0) errors.name = 'Name is required.';

  const premium = wholeNumber(values.premiumMinor, false);
  if (premium === null || Number.isNaN(premium)) {
    errors.premiumMinor = 'Premium must be a whole number of minor units.';
  }
  if (!CURRENCY_PATTERN.test(values.currency.trim())) {
    errors.currency = 'Currency must be three uppercase letters.';
  }

  for (const [field, value] of [
    ['minMembershipDays', values.minMembershipDays],
    ['minAge', values.minAge],
    ['maxAge', values.maxAge],
    ['maxDependents', values.maxDependents],
  ] as const) {
    const parsed = wholeNumber(value, true);
    if (parsed !== null && Number.isNaN(parsed)) {
      errors[field] = 'Must be a whole number.';
    }
  }

  const minAge = wholeNumber(values.minAge, true);
  const maxAge = wholeNumber(values.maxAge, true);
  if (minAge !== null && maxAge !== null && minAge > maxAge) {
    errors.maxAge = 'Maximum age must be on or after the minimum age.';
  }

  if (values.covers === 'household') {
    const dependents = wholeNumber(values.maxDependents, true);
    if (dependents === null || dependents < 1) {
      errors.maxDependents = 'A household product requires at least one dependent.';
    }
    if (values.allowedRelationships.length === 0) {
      errors.allowedRelationships = 'Choose at least one allowed relationship.';
    }
  }

  return errors;
}

/** The create body; blank optional numbers are omitted rather than sent as zero. */
export function toProductPayload(values: ProductFormValues) {
  const optionalNumber = (value: string): number | null => {
    const parsed = wholeNumber(value, true);
    return parsed === null ? null : parsed;
  };
  const description = values.description.trim();

  return {
    code: values.code.trim(),
    name: values.name.trim(),
    description: description.length > 0 ? description : null,
    premiumMinor: Number(values.premiumMinor.trim()),
    currency: values.currency.trim(),
    active: values.active,
    minMembershipDays: optionalNumber(values.minMembershipDays) ?? 0,
    requiresCard: values.requiresCard,
    requiresVerified: values.requiresVerified,
    gender: values.gender === '' ? null : values.gender,
    minAge: optionalNumber(values.minAge),
    maxAge: optionalNumber(values.maxAge),
    paymentMode: values.paymentMode,
    periodMonths: values.periodMonths,
    covers: values.covers,
    maxDependents: optionalNumber(values.maxDependents) ?? 0,
    allowedRelationships: values.covers === 'household' ? [...values.allowedRelationships] : [],
  };
}
