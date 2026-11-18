import { ShieldLockRegular } from '@fluentui/react-icons';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import {
  addContact,
  fetchMemberDetail,
  linkContact,
  listMembers,
  removeContact,
  unlinkContact,
  updateContact,
  type MemberContact,
  type MemberDetail,
  type MemberSummary,
} from '../api/members';
import { createTestQueryClient, renderWithProviders } from '../test/render';
import { ContactsDialog, type ContactsDialogMember } from './ContactsDialog';

/**
 * FR-78/AC-47 fix what the read-only dialog must show, and this is where it is
 * pinned: the privacy note as one exact string under a leading shield-lock glyph
 * (not an information mark) with the dialog's single information affordance
 * inline after that copy, and one flat list ordered by kind then `displayOrder`
 * with the owner/linked status at each row's right. AC-53 is pinned the other
 * way: the read-only dialog offers no add, remove, copy or edit control, and the
 * editable one puts the add row above the list with its failure directly under
 * that row, an owned row's Edit/Remove, and a linked row's Unlink. AC-54 is the
 * 409 link offer this file also drives: the owner resolved through the `contact`
 * filter, the link confirmed, and no owner record left in the query cache.
 */

/** Spelled out, not imported: the assertion is the spec's text, not the constant. */
const PRIVACY_NOTE =
  'Contact values are shown only after this explicit action. The members list returns a count, not the values; opening this dialog is the only way to see them here.';

const OWNERSHIP_INFO =
  'Owned values belong to this member. Linked values are shared from another member and stay with its owner.';

/** FR-78 words the offer; this test spells it out rather than importing it. */
const LINK_OFFER = "Link the household's value";

/** FR-78's cascade wording: this member and every member who shares the value. */
const REMOVE_MESSAGE =
  'This value is removed from this member and from every member who shares it.';

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
  title: null,
  membershipCardNo: null,
  verifiedAt: null,
  assemblyJoinedOn: null,
  cameFrom: null,
  movedOutOn: null,
  movedToAssembly: null,
  shepherd: null,
  guardian: null,
  calls: { attempts: 0, conversations: 0, lastCalledOn: null, lastReachedOn: null },
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

/** The other member the `contact` filter returns, read only to resolve an owner. */
const OWNER: MemberDetail = {
  ...DETAIL,
  id: 'member-1002',
  memberNo: 'M-1002',
  firstName: 'Ama',
  lastName: 'Mensah',
  gender: 'female',
  age: null,
  ageMonths: null,
  isPresbyter: false,
  dob: null,
  contacts: [
    {
      id: 'contact-1002-phone',
      kind: 'phone',
      value: '+233 20 000 0002',
      displayOrder: 0,
      ownerMemberNo: 'M-1002',
      linked: false,
    },
    {
      id: 'contact-1002-email',
      kind: 'email',
      value: 'ama.mensah@example.test',
      displayOrder: 0,
      ownerMemberNo: 'M-1002',
      linked: false,
    },
  ],
  contactCount: 2,
};

const OWNER_SUMMARY: MemberSummary = {
  memberNo: 'M-1002',
  firstName: 'Ama',
  lastName: 'Mensah',
  otherNames: null,
  gender: 'female',
  age: null,
  ageMonths: null,
  placeOfResidence: 'Accra',
  joinedOn: '2020-07-19',
  isPresbyter: false,
  archivedAt: null,
  contactCount: 2,
  ministries: [],
};

/** The dialog's own member, returned by the filter for a value it already owns. */
const SELF_SUMMARY: MemberSummary = {
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
};

/** The owner line the offer renders: the label plus the member number, nothing else. */
const OWNER_LINE = 'Owned by Ama Mensah (Female) · M-1002';

vi.mock('../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/members')>();
  return {
    ...actual,
    fetchMemberDetail: vi.fn(),
    addContact: vi.fn(),
    updateContact: vi.fn(),
    removeContact: vi.fn(),
    linkContact: vi.fn(),
    unlinkContact: vi.fn(),
    listMembers: vi.fn(),
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

beforeEach(() => {
  // The component's own detail read and the owner resolution share one function;
  // the resolution asks for the other member, so the fixture answers by number.
  vi.mocked(fetchMemberDetail).mockImplementation(async (_baseUrl, _token, memberNo) => ({
    member: memberNo === 'M-1002' ? OWNER : DETAIL,
    etag: null,
  }));
  vi.mocked(listMembers).mockResolvedValue({ items: [] });
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
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Unlink / })).toBeNull();

    // The title's "no copy" claim: FR-78 makes the list dialog reveal-only, so
    // neither a copy control nor any copy affordance may exist.
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
    expect(screen.queryByText(/copy/i)).toBeNull();

    // Status stays on the rows while its actions do not.
    expect(screen.getAllByText('Owned')).toHaveLength(3);
    expect(screen.getByText('Linked · M-1002')).toBeInTheDocument();
    // Not one row action of any kind, including inside the rows themselves.
    const rows = screen.getAllByRole('listitem');
    for (const row of rows) expect(within(row).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('ContactsDialog editable list (FR-78, AC-53, AC-54)', () => {
  it('puts the add row above the list, two named actions on an owned row and Unlink on a linked one', async () => {
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

    // AC-53/FR-78: an owned row carries exactly two icon actions, each named with
    // its verb, its kind and its value; the linked row carries Unlink and nothing
    // else, so no Remove reaches a value this member does not own.
    const rows = within(list).getAllByRole('listitem');
    for (const [value, kind] of [
      ['+233 20 000 0001', 'phone'],
      ['+233 20 000 0004', 'phone'],
      ['kwame.asante@example.test', 'email'],
    ] as const) {
      const row = rows.find((candidate) => candidate.textContent?.includes(value));
      expect(row, `an owned row for ${value}`).toBeDefined();
      const owned = row as HTMLElement;
      const buttons = within(owned).getAllByRole('button');
      expect(buttons, `two controls for ${value}`).toHaveLength(2);
      expect(
        within(owned).getByRole('button', { name: `Edit ${kind} ${value}` }),
        `the owned row's first control edits it`,
      ).toBeInTheDocument();
      expect(
        within(owned).getByRole('button', { name: `Remove ${kind} ${value}` }),
        `the owned row's second control removes it`,
      ).toBeInTheDocument();
    }
    const linkedRow = rows.find((candidate) => candidate.textContent?.includes('+233 20 000 0009'));
    expect(linkedRow, 'the linked row renders').toBeDefined();
    const linkedButtons = within(linkedRow as HTMLElement).getAllByRole('button');
    expect(linkedButtons).toHaveLength(1);
    expect(
      within(linkedRow as HTMLElement).getByRole('button', {
        name: 'Unlink whatsapp +233 20 000 0009',
      }),
    ).toBeInTheDocument();

    // AC-53: a rejected add shows under the input row and keeps the entered value.
    const duplicate = new ApiError(
      409,
      'Contact value "+233 20 000 0004" already belongs to a member',
    );
    vi.mocked(addContact).mockRejectedValueOnce(duplicate);
    await user.type(input, '+233 20 000 0004');
    await user.click(add);

    const failure = await screen.findByText(
      'Contact value "+233 20 000 0004" already belongs to a member',
    );
    expect(input).toHaveValue('+233 20 000 0004');
    expect(vi.mocked(addContact)).toHaveBeenCalledTimes(1);
    expect(
      sitsDirectlyBelow(input.parentElement?.parentElement ?? null, failure),
      'the failed add renders directly under the input row',
    ).toBe(true);
  });

  it('edits a value in place and saves { value } only', async () => {
    const user = userEvent.setup();
    renderDialog(true);

    const dialog = await screen.findByRole('dialog', { name: 'Contacts' });
    await user.click(
      await within(dialog).findByRole('button', { name: 'Edit phone +233 20 000 0001' }),
    );

    // FR-78: the row becomes the add row's one-row form, the value prefilled, with
    // Save and Cancel - kind and displayOrder stay uneditable, so no kind control.
    const editInput = within(dialog).getByRole('textbox', { name: 'Edit contact value' });
    expect(editInput).toHaveValue('+233 20 000 0001');
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    const editingRow = within(dialog)
      .getAllByRole('listitem')
      .find((candidate) =>
        within(candidate).queryByRole('textbox', { name: 'Edit contact value' }),
      );
    expect(editingRow, 'the edit form sits in the row').toBeDefined();
    expect(within(editingRow as HTMLElement).queryByRole('combobox')).toBeNull();

    vi.mocked(updateContact).mockResolvedValueOnce({
      ...CONTACTS[3]!,
      value: '+233 24 555 0101',
    });
    await user.clear(editInput);
    await user.type(editInput, '+233 24 555 0101');
    await user.click(save);

    // The body is `{ value }` and nothing else: kind and displayOrder never ride it.
    expect(vi.mocked(updateContact)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateContact)).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'M-1001',
      'contact-1001-phone-first',
      { value: '+233 24 555 0101' },
    );
    // Success returns the row to display: the edit form is gone.
    await waitFor(() =>
      expect(within(dialog).queryByRole('textbox', { name: 'Edit contact value' })).toBeNull(),
    );
  });

  it('keeps the typed value and shows a failed save under its row', async () => {
    const user = userEvent.setup();
    renderDialog(true);

    const dialog = await screen.findByRole('dialog', { name: 'Contacts' });
    await user.click(
      await within(dialog).findByRole('button', { name: 'Edit phone +233 20 000 0001' }),
    );
    const editInput = within(dialog).getByRole('textbox', { name: 'Edit contact value' });

    const duplicate = new ApiError(
      409,
      'Contact value "+233 20 000 0004" already belongs to a member',
    );
    vi.mocked(updateContact).mockRejectedValueOnce(duplicate);
    await user.clear(editInput);
    await user.type(editInput, '+233 20 000 0004');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const failure = await screen.findByText(
      'Contact value "+233 20 000 0004" already belongs to a member',
    );
    // FR-78: the entered value is kept and the message lands under that row.
    expect(editInput).toHaveValue('+233 20 000 0004');
    const row = within(dialog)
      .getAllByRole('listitem')
      .find((candidate) =>
        within(candidate).queryByRole('textbox', { name: 'Edit contact value' }),
      );
    expect(row, 'the editing row is still the list item').toBeDefined();
    expect(row, 'the failure belongs to the editing row').toContainElement(failure);
    const order = editInput.compareDocumentPosition(failure) ?? 0;
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING, 'the message follows the input').toBeTruthy();
  });

  it('confirms Remove with the cascade wording and no count', async () => {
    const user = userEvent.setup();
    renderDialog(true);

    const dialog = await screen.findByRole('dialog', { name: 'Contacts' });
    await user.click(
      await within(dialog).findByRole('button', { name: 'Remove phone +233 20 000 0001' }),
    );

    // FR-78: the title names the value, the body names the cascade, and no count.
    const confirm = await screen.findByRole('dialog', { name: 'Remove +233 20 000 0001?' });
    const body = within(confirm).getByText(REMOVE_MESSAGE);
    expect(body).toBeInTheDocument();
    expect(body.textContent, 'the confirmation carries no count').not.toMatch(/\d/);
    expect(within(confirm).getByRole('button', { name: 'Remove contact' })).toBeInTheDocument();
    expect(vi.mocked(removeContact)).not.toHaveBeenCalled();
  });

  it('resolves the 409 owner and links the household value without caching the owner', async () => {
    const user = userEvent.setup();
    vi.mocked(listMembers).mockResolvedValueOnce({ items: [OWNER_SUMMARY] });
    vi.mocked(linkContact).mockResolvedValueOnce({
      id: 'contact-1002-phone',
      kind: 'phone',
      value: '+233 20 000 0002',
      displayOrder: 0,
      ownerMemberNo: 'M-1002',
      linked: true,
    });
    const client = createTestQueryClient();
    renderWithProviders(<ContactsDialog member={MEMBER} open onOpenChange={vi.fn()} editable />, {
      client,
    });

    const dialog = await screen.findByRole('dialog', { name: 'Contacts' });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Contact value' }),
      '+233 20 000 0002',
    );
    vi.mocked(addContact).mockRejectedValueOnce(
      new ApiError(409, 'Contact value "+233 20 000 0002" already belongs to a member'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    // AC-54: the offer names the owner and its member number.
    expect(await screen.findByText(OWNER_LINE)).toBeInTheDocument();
    const link = within(dialog).getByRole('button', { name: LINK_OFFER });

    // The owner was found through the existing contact filter, not a new endpoint.
    expect(vi.mocked(listMembers)).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ contact: '+233 20 000 0002' }),
    );
    // NFR-4: nothing else from the owner's record is rendered…
    expect(screen.queryByText('ama.mensah@example.test')).toBeNull();
    // …and the direct read left no member query entry behind.
    const cached = client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(cached.some((key) => Array.isArray(key) && key.includes('M-1002'))).toBe(false);
    // Positive control: the dialog's own member is in that same cache, so the
    // negative above cannot pass on a mis-wired client.
    expect(cached.some((key) => Array.isArray(key) && key.includes('M-1001'))).toBe(true);

    await user.click(link);
    expect(vi.mocked(linkContact)).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'M-1001',
      'contact-1002-phone',
    );
    // The offer is spent and the add row is clear for the next value.
    await waitFor(() =>
      expect(within(dialog).queryByRole('button', { name: LINK_OFFER })).toBeNull(),
    );
    expect(within(dialog).getByRole('textbox', { name: 'Contact value' })).toHaveValue('');
  });

  it('keeps the plain inline error and offers no link when the owner does not resolve', async () => {
    const user = userEvent.setup();
    renderDialog(true);

    const dialog = await screen.findByRole('dialog', { name: 'Contacts' });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Contact value' }),
      '+233 20 000 0002',
    );
    vi.mocked(addContact).mockRejectedValueOnce(
      new ApiError(409, 'Contact value "+233 20 000 0002" already belongs to a member'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText('Contact value "+233 20 000 0002" already belongs to a member'),
    ).toBeInTheDocument();
    // The filter ran and found nobody who owns the value: no offer, error only.
    await waitFor(() => expect(vi.mocked(listMembers)).toHaveBeenCalledTimes(1));
    expect(within(dialog).queryByRole('button', { name: LINK_OFFER })).toBeNull();
    expect(within(dialog).getByRole('textbox', { name: 'Contact value' })).toHaveValue(
      '+233 20 000 0002',
    );
  });

  it('makes no offer when the duplicate value is one this member already owns', async () => {
    const user = userEvent.setup();
    // The filter returns the dialog's own member; its row would be `linked: false`,
    // but the offer is for a value "owned by another member" (FR-78).
    vi.mocked(listMembers).mockResolvedValueOnce({ items: [SELF_SUMMARY] });
    renderDialog(true);

    const dialog = await screen.findByRole('dialog', { name: 'Contacts' });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Contact value' }),
      '+233 20 000 0001',
    );
    vi.mocked(addContact).mockRejectedValueOnce(
      new ApiError(409, 'Contact value "+233 20 000 0001" already belongs to a member'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText('Contact value "+233 20 000 0001" already belongs to a member'),
    ).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(listMembers)).toHaveBeenCalledTimes(1));
    expect(within(dialog).queryByRole('button', { name: LINK_OFFER })).toBeNull();
    // The member's own record is not re-read to "resolve" itself.
    expect(vi.mocked(fetchMemberDetail)).toHaveBeenCalledTimes(1);
  });

  it('keeps the offer and puts a failed link beneath it', async () => {
    const user = userEvent.setup();
    vi.mocked(listMembers).mockResolvedValueOnce({ items: [OWNER_SUMMARY] });
    vi.mocked(linkContact).mockRejectedValueOnce(
      new ApiError(409, 'This contact is already linked'),
    );
    renderDialog(true);

    const dialog = await screen.findByRole('dialog', { name: 'Contacts' });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Contact value' }),
      '+233 20 000 0002',
    );
    vi.mocked(addContact).mockRejectedValueOnce(
      new ApiError(409, 'Contact value "+233 20 000 0002" already belongs to a member'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    await screen.findByText(OWNER_LINE);
    await user.click(within(dialog).getByRole('button', { name: LINK_OFFER }));

    // FR-78: the offer stays and the failure sits beneath it.
    expect(await within(dialog).findByText('This contact is already linked')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: LINK_OFFER })).toBeInTheDocument();
    expect(within(dialog).getByText(OWNER_LINE)).toBeInTheDocument();
  });

  it('closes a failed Unlink confirmation and shows the action error above the list', async () => {
    const user = userEvent.setup();
    vi.mocked(unlinkContact).mockRejectedValueOnce(new Error('The link could not be removed.'));
    renderDialog(true);

    const dialog = await screen.findByRole('dialog', { name: 'Contacts' });
    await user.click(
      await within(dialog).findByRole('button', { name: 'Unlink whatsapp +233 20 000 0009' }),
    );
    const confirm = await screen.findByRole('dialog', { name: 'Unlink +233 20 000 0009?' });
    await user.click(within(confirm).getByRole('button', { name: 'Unlink' }));

    // FR-78: the confirmation closes, the list is unchanged, the action error is
    // above the list and the row still offers Unlink.
    expect(await screen.findByText('The link could not be removed.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Unlink +233 20 000 0009?' })).toBeNull();
    expect(
      within(dialog).getByRole('button', { name: 'Unlink whatsapp +233 20 000 0009' }),
    ).toBeInTheDocument();
    expect(vi.mocked(unlinkContact)).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'M-1001',
      'contact-1001-whatsapp',
    );
  });
});
