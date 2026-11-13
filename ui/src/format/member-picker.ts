import { MEMBER_PICKER_LIMIT } from '../api/members';
import type { Gender } from '../api/members';
import { memberName } from './member';

/**
 * Pure result mapping for `MemberPicker`. The component owns the debounce and
 * the query; this function turns a list page into `memberNo · FullName (code, age)`
 * options so it can be tested without a DOM.
 */

export interface MemberPickerCandidate {
  readonly memberNo: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly otherNames?: string | null;
  readonly gender?: Gender;
  readonly ageMonths?: number | null;
}

export interface MemberPickerOption {
  readonly memberNo: string;
  readonly name: string;
  /** The visible and accessible `memberNo · FullName (code, age)` label. */
  readonly label: string;
}

const GENDER_CODES: Record<Gender, string> = {
  male: 'M',
  female: 'F',
  other: 'O',
  undisclosed: '–',
};

/** `8m` below twelve completed months, `Ny` from twelve, `–` when unknown. */
function ageCode(ageMonths: number | null | undefined): string {
  if (ageMonths === null || ageMonths === undefined) return '–';
  return ageMonths < 12 ? `${ageMonths}m` : `${Math.floor(ageMonths / 12)}y`;
}

/**
 * The picker's compact identity (FR-22a): `M, 12y`, `F, 8m`, `O, –`, `–, –`.
 * A picker-only exception to the capitalised omission form, because a list must
 * keep two same-named members distinguishable.
 */
export function memberPickerIdentity(
  gender: Gender | undefined,
  ageMonths: number | null | undefined,
): string {
  const code = gender ? GENDER_CODES[gender] : '–';
  return `${code}, ${ageCode(ageMonths)}`;
}

/** Maps the list page to at most ten `memberNo · identity` options. */
export function toMemberPickerOptions(
  members: readonly MemberPickerCandidate[],
  excludeMemberNo?: string,
): MemberPickerOption[] {
  return members
    .filter((member) => member.memberNo !== excludeMemberNo)
    .slice(0, MEMBER_PICKER_LIMIT)
    .map((member) => {
      const name = memberName(member);
      const identity = memberPickerIdentity(member.gender, member.ageMonths);
      return {
        memberNo: member.memberNo,
        name,
        label: name ? `${member.memberNo} · ${name} (${identity})` : member.memberNo,
      };
    });
}
