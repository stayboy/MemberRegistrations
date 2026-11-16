import { ShieldLockRegular } from '@fluentui/react-icons';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MemberContact, MemberDetail } from '../api/members';
import { renderWithProviders } from '../test/render';
import { ContactsDialog, type ContactsDialogMember } from './ContactsDialog';

/**
 * FR-78/AC-47 fix what the read-only dialog must show, and this is where it is
 * pinned: the privacy note as one exact string under a leading shield-lock glyph
 * (not an information mark), a heading per rendered group, one Fluent information
 * button on each heading row whose accessible name is the owned/linked sentence —
 * not the group name Fluent would derive from its label — and no copy affordance.
 */

/** Spelled out, not imported: the assertion is the spec's text, not the constant. */
const PRIVACY_NOTE =
  'Contact values are shown only after this explicit action. The members list returns a count, not the values; opening this dialog is the only way to see them here.';

const GROUP_INFO =
  'Owned values belong to this member. Linked values are shared from another member and stay with its owner.';

const MEMBER: ContactsDialogMember = {
  memberNo: 'M-1001',
  firstName: 'Kwame',
  lastName: 'Asante',
  gender: 'male',
  age: 41,
  isPresbyter: true,
};

const CONTACTS: readonly MemberContact[] = [
  {
    id: 'contact-1001-phone',
    kind: 'phone',
    value: '+233 20 000 0001',
    displayOrder: 0,
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
    id: 'contact-1001-whatsapp',
    kind: 'whatsapp',
    value: '+233 20 000 0009',
    displayOrder: 0,
    ownerMemberNo: 'M-1002',
    linked: true,
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

function renderDialog() {
  return renderWithProviders(<ContactsDialog member={MEMBER} open onOpenChange={vi.fn()} />);
}

/**
 * The note panel is the copy's nearest ancestor that also holds a glyph. Written as
 * a walk rather than a fixed `parentElement` hop so a Fluent wrapper around `Text`
 * cannot silently unpin the assertion.
 */
function notePanel(copy: HTMLElement): HTMLElement | null {
  for (let element = copy.parentElement; element; element = element.parentElement) {
    if (element.querySelector('svg')) return element;
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

describe('ContactsDialog read-only list (FR-78, AC-47)', () => {
  it('shows the privacy note as one string, a heading per group and the owned/linked information button on each', async () => {
    renderDialog();

    // The dialog waits for the detail, then the note stands above the groups.
    const noteText = await screen.findByText(PRIVACY_NOTE, { exact: true });

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
    // "Not an information mark": the glyph is not a focusable affordance, and the
    // drawing it carries is the shield-lock's — compared against the icon library's
    // own rendering, never a hard-coded path or a class name Fluent may rename.
    expect(note?.querySelector('button'), 'the note offers nothing to press').toBeNull();
    const expected = shieldLockDrawing();
    expect(expected, 'the shield-lock icon must render a drawing').not.toBe('');
    expect(iconDrawing(glyph), 'the note must lead with the shield-lock glyph').toBe(expected);

    for (const group of ['Phone', 'Email', 'WhatsApp'] as const) {
      const region = screen.getByRole('region', { name: group });

      // The title is a real heading, so the drawing's hierarchy survives (FR-78).
      const heading = within(region).getByRole('heading', { level: 3, name: group });
      expect(heading).toBeInTheDocument();

      // One focusable affordance per group, named with the exact sentence (FR-81).
      const info = within(region).getByRole('button', { name: GROUP_INFO });
      expect(info).toBeInTheDocument();

      // FR-78 puts that affordance on the heading row: an affordance that drifts
      // elsewhere in the group is not the heading's.
      expect(heading.parentElement, 'the heading has a row of its own').not.toBeNull();
      expect(heading.parentElement).toContainElement(info);
    }

    // Three groups, three information buttons — none named after its own group.
    expect(screen.getAllByRole('button', { name: GROUP_INFO })).toHaveLength(3);
    expect(
      screen.queryByRole('button', { name: 'information' }),
      'the default Fluent name must be replaced',
    ).toBeNull();
  });

  it('stays read-only: no copy, no add form and no remove button', async () => {
    renderDialog();

    expect(await screen.findByText(PRIVACY_NOTE)).toBeInTheDocument();
    // The title's "no copy" claim: FR-78 makes the list dialog reveal-only, so
    // neither a copy control nor any copy affordance may exist.
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
    expect(screen.queryByText(/copy/i)).toBeNull();
    expect(screen.queryByText('Add contact')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
    expect(screen.getByText('Linked · M-1002')).toBeInTheDocument();
  });
});
