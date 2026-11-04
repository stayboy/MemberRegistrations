import { ApiError } from '../api/errors';
import type {
  Gender,
  MemberDetail,
  MemberDetailResult,
  MemberInput,
  MemberUpdateInput,
} from '../api/members';

/**
 * Pure form helpers for the member create/edit screen. The constraints mirror
 * `createMemberSchema` and `dateStringSchema` so the browser rejects the same
 * input the API would reject, before a request is made (FR-24).
 */

export type MemberFormField =
  | 'memberNo'
  | 'firstName'
  | 'lastName'
  | 'otherNames'
  | 'maidenName'
  | 'alias'
  | 'dob'
  | 'gender'
  | 'placeOfResidence'
  | 'addressLine'
  | 'joinedOn'
  | 'isPresbyter';

export type MemberFormErrors = Partial<Record<MemberFormField, string>>;

export interface MemberFormValues {
  readonly memberNo: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly otherNames: string;
  readonly maidenName: string;
  readonly alias: string;
  readonly dob: string;
  readonly gender: Gender;
  readonly placeOfResidence: string;
  readonly addressLine: string;
  readonly joinedOn: string;
  readonly isPresbyter: boolean;
}

export const GENDER_OPTIONS: readonly { readonly value: Gender; readonly label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'undisclosed', label: 'Undisclosed' },
];

export function genderLabel(gender: Gender): string {
  return GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? 'Undisclosed';
}

const MEMBER_NO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Today as a UTC calendar date, the default the API applies to `joinedOn`. */
export function utcToday(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function requiredText(value: string, label: string, max: number): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return `${label} is required.`;
  if (trimmed.length > max) return `${label} must be ${max} characters or fewer.`;
  return null;
}

function optionalText(value: string, label: string, max: number): string | null {
  if (value.trim().length > max) return `${label} must be ${max} characters or fewer.`;
  return null;
}

function optionalDate(value: string, label: string): string | null {
  if (value.trim().length === 0) return null;
  return parseCalendarDate(value.trim())
    ? null
    : `${label} must be a real date in YYYY-MM-DD form.`;
}

/** The client-side mirror of the API's create/update constraints. */
export function validateMemberForm(values: MemberFormValues): MemberFormErrors {
  const errors: MemberFormErrors = {};
  const memberNo = values.memberNo.trim();

  if (memberNo.length === 0) {
    errors.memberNo = 'Member number is required.';
  } else if (!MEMBER_NO_PATTERN.test(memberNo)) {
    errors.memberNo =
      'Member number must be 1-32 characters and contain only letters, digits, hyphens or underscores.';
  }

  const firstName = requiredText(values.firstName, 'First name', 100);
  if (firstName) errors.firstName = firstName;

  const lastName = requiredText(values.lastName, 'Last name', 100);
  if (lastName) errors.lastName = lastName;

  const otherNames = optionalText(values.otherNames, 'Other names', 200);
  if (otherNames) errors.otherNames = otherNames;

  const maidenName = optionalText(values.maidenName, 'Maiden name', 100);
  if (maidenName) errors.maidenName = maidenName;

  const alias = optionalText(values.alias, 'Alias', 100);
  if (alias) errors.alias = alias;

  const dob = optionalDate(values.dob, 'Date of birth');
  if (dob) errors.dob = dob;

  const placeOfResidence = optionalText(values.placeOfResidence, 'Place of residence', 200);
  if (placeOfResidence) errors.placeOfResidence = placeOfResidence;

  const addressLine = optionalText(values.addressLine, 'Address line', 300);
  if (addressLine) errors.addressLine = addressLine;

  const joinedOn = optionalDate(values.joinedOn, 'Joined on');
  if (joinedOn) errors.joinedOn = joinedOn;

  return errors;
}

/** A fresh add-mode form; `joinedOn` defaults to today in UTC. */
export function createEmptyMemberForm(joinedOn: string = utcToday()): MemberFormValues {
  return {
    memberNo: '',
    firstName: '',
    lastName: '',
    otherNames: '',
    maidenName: '',
    alias: '',
    dob: '',
    gender: 'undisclosed',
    placeOfResidence: '',
    addressLine: '',
    joinedOn,
    isPresbyter: false,
  };
}

/** Prefills edit mode from the detail DTO (FR-25). */
export function fromMemberDetail(member: MemberDetail): MemberFormValues {
  return {
    memberNo: member.memberNo,
    firstName: member.firstName,
    lastName: member.lastName,
    otherNames: member.otherNames ?? '',
    maidenName: member.maidenName ?? '',
    alias: member.alias ?? '',
    dob: member.dob ?? '',
    gender: member.gender,
    placeOfResidence: member.placeOfResidence ?? '',
    addressLine: member.addressLine ?? '',
    joinedOn: member.joinedOn ?? '',
    isPresbyter: member.isPresbyter,
  };
}

/**
 * The create body: optional blanks become `null`, which the API treats as an
 * explicit clear rather than an omission.
 */
export function toCreatePayload(values: MemberFormValues): MemberInput {
  return {
    memberNo: values.memberNo.trim(),
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    otherNames: blankToNull(values.otherNames),
    maidenName: blankToNull(values.maidenName),
    alias: blankToNull(values.alias),
    dob: blankToNull(values.dob),
    gender: values.gender,
    placeOfResidence: blankToNull(values.placeOfResidence),
    addressLine: blankToNull(values.addressLine),
    joinedOn: blankToNull(values.joinedOn),
    isPresbyter: values.isPresbyter,
  };
}

/**
 * The edit body sends only changed fields, so an untouched form never bumps the
 * row version and unrelated concurrent edits are not clobbered.
 */
export function toUpdatePayload(
  values: MemberFormValues,
  original: MemberFormValues,
): MemberUpdateInput {
  const next = toCreatePayload(values);
  const base = toCreatePayload({ ...original, memberNo: next.memberNo });
  const payload: MemberUpdateInput = {};

  if (next.firstName !== base.firstName) payload.firstName = next.firstName;
  if (next.lastName !== base.lastName) payload.lastName = next.lastName;
  if (next.otherNames !== base.otherNames) payload.otherNames = next.otherNames;
  if (next.maidenName !== base.maidenName) payload.maidenName = next.maidenName;
  if (next.alias !== base.alias) payload.alias = next.alias;
  if (next.dob !== base.dob) payload.dob = next.dob;
  if (next.gender !== base.gender) payload.gender = next.gender;
  if (next.placeOfResidence !== base.placeOfResidence) {
    payload.placeOfResidence = next.placeOfResidence;
  }
  if (next.addressLine !== base.addressLine) payload.addressLine = next.addressLine;
  if (next.joinedOn !== base.joinedOn) payload.joinedOn = next.joinedOn;
  if (next.isPresbyter !== base.isPresbyter) payload.isPresbyter = next.isPresbyter;

  return payload;
}

/** The kept edit re-applied to the freshly loaded record (FR-26). */
export interface KeptMemberForm {
  readonly values: MemberFormValues;
  /** The freshly read ETag; `null` only when the gateway did not expose it. */
  readonly etag: string | null;
}

/**
 * Copy-after-reload for a lost-update conflict: the server's latest detail
 * supplies the ETag, the immutable member number and every field the operator
 * did not touch, while the kept values win for the editable fields. The result
 * is always a complete form, so no field is left undefined.
 */
export function mergeKeptValues(
  latest: MemberDetailResult,
  kept: Partial<MemberFormValues>,
): KeptMemberForm {
  const base = fromMemberDetail(latest.member);

  return {
    values: {
      memberNo: base.memberNo,
      firstName: kept.firstName ?? base.firstName,
      lastName: kept.lastName ?? base.lastName,
      otherNames: kept.otherNames ?? base.otherNames,
      maidenName: kept.maidenName ?? base.maidenName,
      alias: kept.alias ?? base.alias,
      dob: kept.dob ?? base.dob,
      gender: kept.gender ?? base.gender,
      placeOfResidence: kept.placeOfResidence ?? base.placeOfResidence,
      addressLine: kept.addressLine ?? base.addressLine,
      joinedOn: kept.joinedOn ?? base.joinedOn,
      isPresbyter: kept.isPresbyter ?? base.isPresbyter,
    },
    etag: latest.etag,
  };
}

export function isConflictError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

/**
 * The update route uses the same `conflict` code for a stale `If-Match` and for
 * business rules such as clearing a presbyter who still shepherds. Only the
 * former is a lost-update conflict.
 */
export function isStaleConflictError(error: unknown): boolean {
  return isConflictError(error) && /etag|modified since/i.test((error as ApiError).message);
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * A `409` on create is the duplicate-member-number signal, so the message
 * belongs on the member-number field rather than a generic banner (AC-13).
 */
export function memberNoConflictMessage(error: unknown): string | null {
  if (!isConflictError(error)) return null;
  const detail = (error as ApiError).message.trim();
  return detail || 'A member with this member number already exists.';
}
