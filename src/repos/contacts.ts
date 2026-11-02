import type { ContactKind } from '../domain/contacts.js';
import type { DbClient, Row } from '../db/sql.js';

export interface ContactDto {
  id: string;
  kind: ContactKind;
  value: string;
  displayOrder: number;
  ownerMemberNo: string;
  linked: boolean;
}

/**
 * Owned contacts plus links to another member's contact. Shared by the member
 * aggregate and the shepherding roster, so an officer sees the same numbers the
 * member record shows.
 */
export async function loadContacts(
  db: DbClient,
  memberIds: string[],
): Promise<Map<string, ContactDto[]>> {
  if (memberIds.length === 0) return new Map();

  const rows = await db.query<
    Row & {
      member_id: string;
      id: string;
      kind: ContactKind;
      value: string;
      display_order: number;
      owner_member_no: string;
      linked: boolean;
    }
  >(
    `select c.member_id, c.id, c.kind, c.value, c.display_order,
            owner.member_no as owner_member_no, false as linked
     from member_contacts c
     join members owner on owner.id = c.member_id
     where c.member_id = any($1::uuid[])
     union all
     select l.member_id, c.id, c.kind, c.value, l.display_order,
            owner.member_no as owner_member_no, true as linked
     from member_contact_links l
     join member_contacts c on c.id = l.contact_id
     join members owner on owner.id = c.member_id
     where l.member_id = any($1::uuid[])
     order by display_order, id`,
    [memberIds],
  );

  const map = new Map<string, ContactDto[]>();
  for (const row of rows) {
    const list = map.get(row.member_id) ?? [];
    list.push({
      id: row.id,
      kind: row.kind,
      value: row.value,
      displayOrder: row.display_order,
      ownerMemberNo: row.owner_member_no,
      linked: row.linked,
    });
    map.set(row.member_id, list);
  }
  return map;
}
