/**
 * Shared member fixtures for the route suites.
 *
 * MR-38 (`documents/specs/member-registrations-member-record.md`) makes every
 * member reachable: a `POST /v1/members` with no own contact and no
 * `guardianMemberNo` is refused with `422 no_contact_or_guardian`. Most suites
 * create members as background data and do not care about contacts, so they
 * borrow one from here. The value is unique per call within a test file, which
 * is what the `member_contacts_value` unique index needs.
 */
let phoneSeq = 0;

/** A unique, valid phone value for a member created by a fixture. */
export function testPhone(): string {
  phoneSeq += 1;
  return `0${String(40_000_000 + phoneSeq).padStart(9, '0')}`;
}

/** The `contacts` row a fixture member is created with. */
export function reachableContacts(): Array<{ kind: 'phone'; value: string }> {
  return [{ kind: 'phone', value: testPhone() }];
}
