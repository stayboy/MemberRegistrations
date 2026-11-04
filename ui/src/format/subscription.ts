import type { SubscriptionInput, SubscriptionKind } from '../api/members';
import { utcToday } from './member-form';

/**
 * Pure helpers for the subscription and coverage dialogs. The constraints
 * mirror `subscriptionInputSchema` and `memberNoParamSchema` so the browser
 * rejects the same input the API would reject, before a request is made.
 */

export type SubscriptionScope = 'individual' | 'household';
export type SubscriptionRole = 'policyholder' | 'covered';
export type SubscriptionStatus = 'active' | 'ended';

export interface SubscriptionFormValues {
  readonly kind: SubscriptionKind | '';
  readonly scope: SubscriptionScope | '';
  readonly reference: string;
  readonly startedOn: string;
  /** Household coverage only; never sent for individual scope (FR-73). */
  readonly coveredMemberNos: readonly string[];
}

export type SubscriptionFormField =
  'kind' | 'scope' | 'reference' | 'startedOn' | 'coveredMemberNos';

export type SubscriptionFormErrors = Partial<Record<SubscriptionFormField, string>>;

export const SUBSCRIPTION_KIND_OPTIONS: readonly {
  readonly value: SubscriptionKind;
  readonly label: string;
}[] = [
  { value: 'life_insurance', label: 'Life insurance' },
  { value: 'credit_union', label: 'Credit union' },
];

export const SUBSCRIPTION_SCOPE_OPTIONS: readonly {
  readonly value: SubscriptionScope;
  readonly label: string;
}[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'household', label: 'Household' },
];

export const REFERENCE_MAX_LENGTH = 100;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MEMBER_NO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export function subscriptionKindLabel(kind: SubscriptionKind | ''): string {
  return SUBSCRIPTION_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? '—';
}

export function subscriptionScopeLabel(scope: SubscriptionScope | ''): string {
  return SUBSCRIPTION_SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? '—';
}

export function subscriptionRoleLabel(role: SubscriptionRole): string {
  return role === 'policyholder' ? 'Policyholder' : 'Covered';
}

export function subscriptionStatusLabel(status: SubscriptionStatus): string {
  return status === 'active' ? 'Active' : 'Ended';
}

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** A fresh add-subscription form; `startedOn` defaults to today in UTC. */
export function createEmptySubscriptionForm(
  startedOn: string = utcToday(),
): SubscriptionFormValues {
  return {
    kind: 'life_insurance',
    scope: 'individual',
    reference: '',
    startedOn,
    coveredMemberNos: [],
  };
}

/**
 * The client-side mirror of `subscriptionInputSchema`: kind and scope are
 * required, `startedOn` must be a real UTC calendar date, and the reference
 * stays within the API's 100-character limit.
 */
export function validateSubscriptionForm(values: SubscriptionFormValues): SubscriptionFormErrors {
  const errors: SubscriptionFormErrors = {};

  if (!values.kind) errors.kind = 'Kind is required.';
  if (!values.scope) errors.scope = 'Scope is required.';

  if (values.reference.trim().length > REFERENCE_MAX_LENGTH) {
    errors.reference = `Reference must be ${REFERENCE_MAX_LENGTH} characters or fewer.`;
  }

  const startedOn = values.startedOn.trim();
  if (startedOn.length === 0) {
    errors.startedOn = 'Started on is required.';
  } else if (!isCalendarDate(startedOn)) {
    errors.startedOn = 'Started on must be a real date in YYYY-MM-DD form.';
  }

  if (values.scope === 'household') {
    for (const memberNo of values.coveredMemberNos) {
      const message = validateCoverageMemberNo(memberNo);
      if (message) {
        errors.coveredMemberNos = message;
        break;
      }
    }
  }

  return errors;
}

/**
 * The create body. A blank reference becomes `null`. `coveredMemberNos` is sent
 * only for household scope; an individual policy never offers coverage (FR-73).
 */
export function toSubscriptionPayload(values: SubscriptionFormValues): SubscriptionInput {
  if (!values.kind || !values.scope) {
    throw new Error('Subscription kind and scope are required.');
  }

  const reference = values.reference.trim();
  const base = {
    kind: values.kind,
    scope: values.scope,
    reference: reference.length > 0 ? reference : null,
    startedOn: values.startedOn.trim(),
  };

  if (values.scope === 'household') {
    return { ...base, coveredMemberNos: [...values.coveredMemberNos] };
  }

  return base;
}

/**
 * Adds a covered member number to the household draft. An empty, malformed or
 * duplicate entry returns the unchanged list plus the inline message.
 */
export function addCoveredMemberNo(
  current: readonly string[],
  candidate: string,
): { readonly memberNos: readonly string[]; readonly error: string | null } {
  const message = validateCoverageMemberNo(candidate);
  if (message) return { memberNos: current, error: message };

  const trimmed = candidate.trim();
  if (current.includes(trimmed)) {
    return { memberNos: current, error: `${trimmed} is already covered by this policy.` };
  }

  return { memberNos: [...current, trimmed], error: null };
}

/** The member-number rule shared by the coverage dialog and the API. */
export function validateCoverageMemberNo(memberNo: string): string | null {
  const trimmed = memberNo.trim();
  if (trimmed.length === 0) return 'Member number is required.';
  if (!MEMBER_NO_PATTERN.test(trimmed)) {
    return 'Member number must be 1-32 characters and contain only letters, digits, hyphens or underscores.';
  }
  return null;
}

export function coverageCountLabel(count: number): string {
  const safe = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (safe === 0) return 'No covered members';
  if (safe === 1) return '1 covered member';
  return `${safe} covered members`;
}

export function coveredMemberNosLabel(memberNos: readonly string[]): string {
  return memberNos.length === 0 ? 'No coverage' : memberNos.join(', ');
}
