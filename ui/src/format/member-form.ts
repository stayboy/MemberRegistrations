import { ApiError } from '../api/errors';
import type {
  ContactInput,
  ContactKind,
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
  | 'isPresbyter'
  | CreateContactField;

export type MemberFormErrors = Partial<Record<MemberFormField, string>>;

/** The three optional contact fields the create form offers (FR-29a). */
export type CreateContactField = 'phone' | 'email' | 'whatsapp';

/**
 * The create form's contact fields in the order FR-29a fixes, each paired with
 * the API's contact kind: the label the operator reads and the kind the request
 * carries are one entry, so neither can drift.
 */
export const CREATE_CONTACT_FIELDS: readonly {
  readonly field: CreateContactField;
  readonly kind: ContactKind;
  readonly label: string;
}[] = [
  { field: 'phone', kind: 'phone', label: 'Phone' },
  { field: 'email', kind: 'email', label: 'Email' },
  { field: 'whatsapp', kind: 'whatsapp', label: 'WhatsApp' },
];

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
  /** Create only: the edit form has no contact fields (FR-29a). */
  readonly phone: string;
  readonly email: string;
  readonly whatsapp: string;
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

/**
 * Mirrors the API's `contactInputSchema` and `normalizeContactValue`: an optional
 * value is at most 256 characters, an email has to look like one, and a phone or
 * WhatsApp value must carry 7 to 15 digits. Rejecting here keeps an obvious typo
 * out of the one atomic create request.
 */
function optionalContact(kind: ContactKind, value: string, label: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 256) return `${label} must be 256 characters or fewer.`;

  if (kind === 'email') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.toLowerCase())
      ? null
      : `${label} must be an email address.`;
  }

  const digits = trimmed.replace(/\D/g, '').replace(/^0+/, '');
  return digits.length >= 7 && digits.length <= 15
    ? null
    : `${label} must be a phone number with 7 to 15 digits.`;
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

  for (const { field, kind, label } of CREATE_CONTACT_FIELDS) {
    const contact = optionalContact(kind, values[field], label);
    if (contact) errors[field] = contact;
  }

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
    phone: '',
    email: '',
    whatsapp: '',
  };
}

/**
 * Prefills edit mode from the detail DTO (FR-25). The three contact fields stay
 * blank: contacts are managed on the member record (FR-29), not through the edit
 * form, so they can never ride an update body.
 */
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
    phone: '',
    email: '',
    whatsapp: '',
  };
}

/**
 * The create body's `contacts[]` (FR-29a): one row per entered value in the
 * section's own order, and no row for a blank field.
 */
export function toContactInputs(values: MemberFormValues): ContactInput[] {
  const rows: ContactInput[] = [];

  for (const { field, kind } of CREATE_CONTACT_FIELDS) {
    const value = values[field].trim();
    if (value.length > 0) rows.push({ kind, value });
  }

  return rows;
}

/**
 * The create body: optional blanks become `null`, which the API treats as an
 * explicit clear rather than an omission. Contacts ride the same request
 * (FR-29a) and the key is absent entirely when no value was entered.
 */
export function toCreatePayload(values: MemberFormValues): MemberInput {
  const payload: MemberInput = {
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

  const contacts = toContactInputs(values);
  return contacts.length > 0 ? { ...payload, contacts } : payload;
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
      phone: kept.phone ?? base.phone,
      email: kept.email ?? base.email,
      whatsapp: kept.whatsapp ?? base.whatsapp,
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

/** The API's own normalisation, so a quoted value in a 409 finds its field. */
function contactKey(kind: ContactKind, value: string): string {
  const trimmed = value.trim();
  if (kind === 'email') return trimmed.toLowerCase();
  return trimmed.replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * The create is atomic, so a contact value that already belongs to another
 * member fails the whole request with a `409` naming the value (FR-29a). That
 * message belongs against the field it names; every other entered value stays
 * in the form, because nothing was created and nothing is reset. A `409` that
 * names no entered contact is the member-number duplicate, handled by
 * `memberNoConflictMessage`.
 */
export function contactConflictErrors(
  error: unknown,
  values: MemberFormValues,
): MemberFormErrors | null {
  if (!isConflictError(error)) return null;
  const detail = (error as ApiError).message.trim();
  const quoted = /"([^"]+)"/.exec(detail)?.[1];
  if (!quoted) return null;

  const hit = CREATE_CONTACT_FIELDS.find(({ field, kind }) => {
    const entered = values[field].trim();
    return entered.length > 0 && contactKey(kind, entered) === contactKey(kind, quoted);
  });
  if (!hit) return null;

  const errors: MemberFormErrors = {};
  errors[hit.field] = detail;
  return errors;
}
