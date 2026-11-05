import { MEMBER_PICKER_LIMIT } from '../api/members';
import type { Gender } from '../api/members';
import { memberLabel, memberName } from './member';

/**
 * Pure result mapping for `MemberPicker`. The component owns the debounce and
 * the query; this function turns a list page into `memberNo — label` options so
 * it can be tested without a DOM.
 */

export interface MemberPickerCandidate {
  readonly memberNo: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly otherNames?: string | null;
  readonly gender?: Gender;
  readonly age?: number | null;
}

export interface MemberPickerOption {
  readonly memberNo: string;
  readonly name: string;
  /** The visible and accessible `memberNo — label` label. */
  readonly label: string;
}

/** Maps the list page to at most ten `memberNo — label` options. */
export function toMemberPickerOptions(
  members: readonly MemberPickerCandidate[],
  excludeMemberNo?: string,
): MemberPickerOption[] {
  return members
    .filter((member) => member.memberNo !== excludeMemberNo)
    .slice(0, MEMBER_PICKER_LIMIT)
    .map((member) => {
      const name = memberName(member);
      const label = memberLabel(member);
      return {
        memberNo: member.memberNo,
        name,
        label: label ? `${member.memberNo} — ${label}` : member.memberNo,
      };
    });
}
