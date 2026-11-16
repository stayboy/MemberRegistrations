import { ShieldLockRegular } from '@fluentui/react-icons';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { addContact, type MemberContact, type MemberDetail } from '../api/members';
import { renderWithProviders } from '../test/render';
import { ContactsDialog, type ContactsDialogMember } from './ContactsDialog';

/**
 * FR-78/AC-47 fix what the read-only dialog must show, and this is where it is
 * pinned: the privacy note as one exact string under a leading shield-lock glyph
 * (not an information mark) with the dialog's single information affordance
 * inline after that copy, and one flat list ordered by kind then `displayOrder`
 * with the owner/linked status at each row's right. AC-53 is pinned the other
 * way: the read-only dialog offers no add, remove, copy or edit control, and the
 * editable one puts the add row above the list with its failure directly under
 * that row.
 */

/** Spelled out, not imported: the assertion is the spec's text, not the constant. */
const PRIVACY_NOTE =
  'Contact values are shown only after this explicit action. The members list returns a count, not the values; opening this dialog is the only way to see them here.';

const OWNERSHIP_INFO =
  'Owned values belong to this member. Linked values are shared from another member and stay with its owner.';

const MEMBER: ContactsDialogMember = {
  memberNo: 'M-1001',
  firstName: 'Kwame',
  lastName: 'Asante',
  gender: 'male',
  age: 41,
  isPresbyter: true,
};

/**
 * Deliberately out of the contract's order, and with two phones whose
 * `displayOrder` is reversed, so the row assertions fail if either sort key is
 * dropped: kind order first, then `displayOrder` inside a kind.
 */
const CONTACTS: readonly MemberContact[] = [
  {
    id: 'contact-1001-whatsapp',
    kind: 'whatsapp',
    value: '+233 20 000 0009',
    displayOrder: 0,
    ownerMemberNo: 'M-1002',
    linked: true,
  },
  {
    id: 'contact-1001-phone-second',
    kind: 'phone',
    value: '+233 20 000 0004',
    displayOrder: 1,
    ownerMemberNo: 'M-1001',
    linked: false,
  },
  {
    id: 'contact-1001-email',
    kind: 'email',
    value: 'kwame.asante@example.test',
    displayOrder: 0,
    ownerMemberNo: 'M-1001',
    linked: false,
  },
  {
    id: 'contact-1001-phone-first',
    kind: 'phone',
    value: '+233 20 000 0001',
    displayOrder: 0,
    ownerMemberNo: 'M-1001',
    linked: false,
  },
];

const DETAIL: MemberDetail = {
  id: 'member-1001',
  memberNo: 'M-1001',
  firstName: 'Kwame',
  lastName: 'Asante',
  otherNames: null,
  gender: 'male',
  age: 41,
  ageMonths: 492,
  placeOfResidence: 'Tema',
  joinedOn: '2019-03-03',
  isPresbyter: true,
  archivedAt: null,
  contactCount: CONTACTS.length,
  ministries: [],
  maidenName: null,
  alias: null,
  dob: '1985-04-12',
  addressLine: '12 Harbour Road',
  purgedAt: null,
  version: 3,
  createdAt: '2024-01-07T09:30:00.000Z',
  updatedAt: '2024-05-02T11:00:00.000Z',
  contacts: CONTACTS,
  subscriptions: [],
  relationships: [],
  attendance: [],
};

vi.mock('../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/members')>();
  return {
    ...actual,
    fetchMemberDetail: vi.fn(async () => ({ member: DETAIL, etag: null })),
    addContact: vi.fn(),
    removeContact: vi.fn(),
  };
});

vi.mock('../api/gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/gateway')>();
  return {
    ...actual,
    fetchMe: vi.fn(async () => ({
      id: 'officer-1',
      name: 'Efua Boateng',
      email: 'efua@example.test',
      actorId: 'efua',
    })),
  };
});

function renderDialog(editable = false) {
  return renderWithProviders(
    <ContactsDialog member={MEMBER} open onOpenChange={vi.fn()} editable={editable} />,
  );
}

/**
 * The note panel is the copy's nearest ancestor holding a glyph *ahead of* the copy.
 * The information button nested later in the same panel carries an icon of its own,
 * so "any svg" would stop at the inline wrapper; the leading glyph is what makes the
 * panel the note. Written as a walk rather than a fixed hop so a Fluent wrapper
 * cannot silently unpin the assertion.
 */
function notePanel(copy: HTMLElement): HTMLElement | null {
  for (let element = copy.parentElement; element; element = element.parentElement) {
    const leading = Array.from(element.querySelectorAll('svg')).some(
      (glyph) =>
        ((glyph.compareDocumentPosition(copy) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    );
    if (leading) return element;
  }
  return null;
}

/**
 * The drawing a rendered Fluent icon carries. Comparing renderings is how the DOM
 * can tell one icon from another without pinning a class name or a hard-coded path.
 */
function iconDrawing(svg: Element | null | undefined): string {
  return Array.from(svg?.querySelectorAll('path') ?? [])
    .map((path) => path.getAttribute('d') ?? '')
    .join('|');
}

/** The shield-lock drawing, from the icon library itself, so an upgrade moves both. */
function shieldLockDrawing(): string {
  const reference = render(<ShieldLockRegular aria-hidden />);
  const drawing = iconDrawing(reference.container.querySelector('svg'));
  reference.unmount();
  return drawing;
}

/**
 * AC-53's "directly under that row": the node renders inside an element that is
 * the immediate next sibling of the row that holds the input, not merely somewhere
 * after it in the dialog.
 */
function sitsDirectlyBelow(row: Element | null, node: HTMLElement): boolean {
  if (!row) return false;
  for (let element: HTMLElement | null = node; element; element = element.parentElement) {
    if (element.parentElement === row.parentElement && element.previousElementSibling === row) {
      return true;
    }
  }
  return false;
}

/** The row's three cells in DOM order: kind, value, then owner/linked status. */
function rowCells(row: HTMLElement): readonly (string | null)[] {
  return Array.from(row.children).map((cell) => cell.textContent);
}

describe('ContactsDialog read-only list (FR-78, AC-47)', () => {
  it('shows the note with its shield-lock glyph and single information button, then one flat list', async () => {
    renderDialog();

    // AC-47: the dialog keeps its name and the note states the whole rule, verbatim.
    const dialog = await screen.findByRole('dialog', { name: 'Contacts' });
    const noteText = within(dialog).getByText(PRIVACY_NOTE, { exact: true });

    // FR-78: the note is a bordered panel led by the shield-lock privacy glyph,
    // explicitly "not an information mark". Assert the structure — a leading,
    // non-interactive, decorative svg before the copy — never an icon class name.
    const note = notePanel(noteText);
    expect(note, 'the note sits in a panel beside its glyph').not.toBeNull();

    const glyph = note?.querySelector('svg');
    expect(glyph, 'the note leads with a glyph').not.toBeNull();
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    // Leading: nothing, not even a stray text node, stands before the glyph.
    expect(note?.firstChild, 'the glyph is the panel’s first child').toBe(glyph);
    // …and the copy follows it rather than preceding it (0 = no relation, so it fails).
    const order = glyph?.compareDocumentPosition(noteText) ?? 0;
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING, 'the copy follows the glyph').toBeTruthy();
    expect(note).toHaveTextContent(PRIVACY_NOTE);
    // The drawing is the shield-lock's — compared against the icon library's own
    // rendering, never a hard-coded path or a class name Fluent may rename.
    const expected = shieldLockDrawing();
    expect(expected, 'the shield-lock icon must render a drawing').not.toBe('');
    expect(iconDrawing(glyph), 'the note must lead with the shield-lock glyph').toBe(expected);

    // FR-78/AC-47: the note carries the dialog's single focusable information
    // affordance, inline after the copy rather than on a line of its own.
    // Fluent wires its own `aria-labelledby` to the label it is handed, so the
    // button's computed name is the note copy; the exact ownership sentence lives
    // on the button's `aria-label`, which is what FR-81 requires of the trigger.
    const info = within(dialog).getByLabelText(OWNERSHIP_INFO);
    expect(within(dialog).getAllByLabelText(OWNERSHIP_INFO)).toHaveLength(1);
    expect(info.tagName).toBe('BUTTON');
    expect(info).toHaveAttribute('aria-label', OWNERSHIP_INFO);
    expect(note, 'the information affordance belongs to the note').toContainElement(info);
    const infoOrder = noteText.compareDocumentPosition(info) ?? 0;
    expect(
      infoOrder & Node.DOCUMENT_POSITION_FOLLOWING,
      'the button follows the copy',
    ).toBeTruthy();
    // Inline: the button shares its wrapper with the note's own text, so it flows
    // with the sentence instead of starting a new block.
    expect(info.parentElement, 'the button sits with the copy').toContainElement(noteText);
    expect(info.parentElement).toHaveTextContent(PRIVACY_NOTE);
    // The note holds that one control and nothing else to press.
    expect(note?.querySelectorAll('button')).toHaveLength(1);
    // FR-81's click/tap path: the full description is reachable, not hover-only.
    await userEvent.setup().click(info);
    expect(await screen.findByText(OWNERSHIP_INFO)).toBeInTheDocument();

    // AC-47/FR-78: one flat list, ordered by kind and then `displayOrder`, each row
    // carrying the kind, the value and the owner/linked status at its right.
    const list = within(dialog).getByRole('list');
    const rows = within(list).getAllByRole('listitem');
    const expectedRows = [
      ['Phone', '+233 20 000 0001', 'Owned'],
      ['Phone', '+233 20 000 0004', 'Owned'],
      ['Email', 'kwame.asante@example.test', 'Owned'],
      ['WhatsApp', '+233 20 000 0009', 'Linked · M-1002'],
    ] as const;
    expect(rows).toHaveLength(expectedRows.length);
    expectedRows.forEach(([kind, value, status], index) => {
      const cells = rowCells(rows[index] as HTMLElement);
      expect(cells).toHaveLength(3);
      expect(cells[0], `row ${index + 1} names its kind first`).toBe(kind);
      expect(cells[1], `row ${index + 1} carries its value`).toBe(value);
      expect(cells[2], `row ${index + 1} ends with its status`).toContain(status);
    });

    // The per-kind landmarks and headings went with the groups: no invented control
    // and no leftover region hierarchy inside the dialog.
    expect(within(dialog).queryAllByRole('region')).toHaveLength(0);
    expect(within(dialog).queryAllByRole('heading', { level: 3 })).toHaveLength(0);
  });

  it('stays read-only: no add, remove, copy or edit control', async () => {
    renderDialog();

    expect(await screen.findByText(PRIVACY_NOTE)).toBeInTheDocument();

    // AC-53's second half: a read-only call site offers none of the four.
    expect(screen.queryByText('Add contact')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByLabelText('Kind')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();

    // The title's "no copy" claim: FR-78 makes the list dialog reveal-only, so
    // neither a copy control nor any copy affordance may exist.
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
    expect(screen.queryByText(/copy/i)).toBeNull();

    // Status stays on the rows while its actions do not.
    expect(screen.getAllByText('Owned')).toHaveLength(3);
    expect(screen.getByText('Linked · M-1002')).toBeInTheDocument();
  });
});

describe('ContactsDialog editable list (FR-78, AC-53)', () => {
  it('puts the add row above the list, Remove on owned rows only, and a failed add under the row', async () => {
    const user = userEvent.setup();
    renderDialog(true);

    const dialog = await screen.findByRole('dialog', { name: 'Contacts' });
    const list = within(dialog).getByRole('list');
    const input = within(dialog).getByRole('textbox', { name: 'Contact value' });
    const kind = within(dialog).getByLabelText('Kind');

    // AC-53: one row — kind, value, Add — above the list, with no section heading
    // and no field labels above them.
    expect(kind).toBeInTheDocument();
    const add = within(dialog).getByRole('button', { name: 'Add' });
    expect(within(dialog).queryByText('Add contact')).toBeNull();
    const inputRow = input.parentElement?.parentElement ?? null;
    expect(inputRow, 'the input sits in the add row').not.toBeNull();
    expect(inputRow?.contains(kind), 'the kind control shares the row').toBe(true);
    expect(inputRow?.contains(add), 'the Add button shares the row').toBe(true);
    expect(
      (inputRow?.compareDocumentPosition(list) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the list follows the add row',
    ).toBeTruthy();

    // AC-53: Remove stays on the rows this member owns, and it is the row's only
    // control — presence alone would let an extra per-row edit or reorder button
    // ride beside it, so the owned row's button set is pinned to Remove.
    const rows = within(list).getAllByRole('listitem');
    for (const value of ['+233 20 000 0001', '+233 20 000 0004', 'kwame.asante@example.test']) {
      const row = rows.find((candidate) => candidate.textContent?.includes(value));
      expect(row, `an owned row for ${value}`).toBeDefined();
      const owned = row as HTMLElement;
      expect(within(owned).getAllByRole('button'), `one control for ${value}`).toHaveLength(1);
      expect(
        within(owned).getByRole('button', { name: `Remove ${value}` }),
        `the owned row's only control is its Remove button`,
      ).toBeInTheDocument();
    }
    const linkedRow = rows.find((candidate) => candidate.textContent?.includes('+233 20 000 0009'));
    expect(linkedRow, 'the linked row renders').toBeDefined();
    expect(within(linkedRow as HTMLElement).queryAllByRole('button')).toHaveLength(0);

    // AC-53: a rejected add shows under the input row and keeps the entered value.
    const duplicate = new ApiError(409, 'Another member already owns +233 20 000 0004.');
    vi.mocked(addContact).mockRejectedValueOnce(duplicate);
    await user.type(input, '+233 20 000 0004');
    await user.click(add);

    const failure = await screen.findByText('Another member already owns +233 20 000 0004.');
    expect(input).toHaveValue('+233 20 000 0004');
    expect(vi.mocked(addContact)).toHaveBeenCalledTimes(1);
    expect(
      sitsDirectlyBelow(input.parentElement?.parentElement ?? null, failure),
      'the failed add renders directly under the input row',
    ).toBe(true);
  });
});
