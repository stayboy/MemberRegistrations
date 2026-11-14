import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RosterEntry } from '../api/shepherding';
import { shiftUtcDate } from '../format/date-window';
import { DEFAULT_DATE_TIME_PREFERENCE, formatCalendarDate } from '../format/datetime';
import { memberLabelFromName } from '../format/member';
import { utcToday } from '../format/member-form';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { ShepherdingRosterPage } from './ShepherdingRosterPage';

/**
 * FR-59a: the identity card, the five count tiles over the full roster read, the
 * client-side search, the row's last-call badge and the row overflow. The tiles are the
 * discriminating surface: computed from the filtered view they still look right on the
 * All tab, so the filter-independence test below is the one that must fail for a
 * regression that narrows the read.
 */

const TODAY = utcToday();

function daysAgo(days: number): string {
  return shiftUtcDate(TODAY, -days) ?? TODAY;
}

function rosterEntry(
  overrides: Partial<RosterEntry> & Pick<RosterEntry, 'memberNo' | 'name'>,
): RosterEntry {
  return {
    assignmentId: `assignment-${overrides.memberNo}`,
    assignedOn: daysAgo(120),
    gender: 'female',
    age: 30,
    placeOfResidence: null,
    contactCount: 1,
    attempts: 0,
    conversations: 0,
    lastCalledOn: null,
    lastOutcome: null,
    stillInChurch: null,
    latestFeedback: null,
    latestIssue: null,
    ...overrides,
  };
}

/** Assigned 5 · Attempts 10 · Conversations 4 · Never called 1 · Follow-ups 3. */
const ROSTER: readonly RosterEntry[] = [
  rosterEntry({ memberNo: 'M-1001', name: 'Ama Mensah' }),
  rosterEntry({
    memberNo: 'M-1002',
    name: 'Kofi Boateng',
    lastCalledOn: daysAgo(31),
    attempts: 3,
    conversations: 1,
  }),
  rosterEntry({
    memberNo: 'M-1003',
    name: 'Yaa Owusu',
    lastCalledOn: daysAgo(30),
    attempts: 2,
    conversations: 1,
  }),
  rosterEntry({
    memberNo: 'M-1004',
    name: 'Kwame Asante',
    lastCalledOn: daysAgo(1),
    attempts: 4,
    conversations: 2,
  }),
  rosterEntry({
    memberNo: 'M-1005',
    name: 'Adjoa Danso',
    lastCalledOn: daysAgo(45),
    attempts: 1,
    conversations: 0,
  }),
];

/** One recently called member: three of the five tiles are zero. */
const ZERO_ROSTER: readonly RosterEntry[] = [
  rosterEntry({
    memberNo: 'M-1006',
    name: 'Esi Badu',
    lastCalledOn: daysAgo(2),
    attempts: 1,
  }),
];

/**
 * The API mock reads this state, so a test can stage a roster, a failure or a
 * held-in-flight read without rebuilding the mock module.
 */
const fixture = vi.hoisted(() => ({
  officer: {
    memberNo: 'M-2001',
    name: 'Efua Boateng',
    gender: 'female' as const,
    age: 47,
    assignedMembers: 5,
    attempts: 10,
    conversations: 4,
    lastCalledOn: null as string | null,
    membersNeverCalled: 1,
  },
  rows: [] as readonly unknown[],
  fail: false,
  gate: null as Promise<void> | null,
  release: null as (() => void) | null,
}));

vi.mock('../api/shepherding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/shepherding')>();
  return {
    ...actual,
    listOfficers: vi.fn(async () => [fixture.officer]),
    getRoster: vi.fn(async () => {
      if (fixture.gate) await fixture.gate;
      if (fixture.fail) throw new Error('The roster read failed.');
      return {
        officerMemberNo: fixture.officer.memberNo,
        from: null,
        to: null,
        items: fixture.rows,
      };
    }),
    endAssignment: vi.fn(async () => undefined),
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
    probeGateway: vi.fn(async () => true),
  };
});

// The row overflow is a handler test: each dialog reports that the page opened it.
vi.mock('../components/ContactsDialog', () => ({
  ContactsDialog: ({ open }: { open: boolean }) =>
    open ? <div>Contacts dialog opened</div> : null,
}));

vi.mock('../components/AssignShepherdDialog', () => ({
  AssignShepherdDialog: () => <div>Reassign dialog opened</div>,
}));

vi.mock('./LogCallDialog', () => ({
  LogCallDialog: () => <div>Log call dialog opened</div>,
}));

vi.mock('../components/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title }: { open: boolean; title?: string }) =>
    open ? <div>Confirm: {title ?? ''}</div> : null,
}));

function labelOf(entry: RosterEntry): string {
  return memberLabelFromName(entry.name || entry.memberNo, entry.gender, entry.age);
}

function renderRoster() {
  return renderWithProviders(
    <MemoryRouter
      initialEntries={['/shepherding/roster?officer=M-2001&from=2026-01-01&to=2026-12-31']}
    >
      <ThemeProvider>
        <DateTimeProvider>
          <ShepherdingRosterPage />
        </DateTimeProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** The tile's own group, named by its visible label, so "Attempts" cannot match a `th`. */
function tile(label: string): HTMLElement {
  return screen.getByRole('group', { name: label });
}

/** The tile's number; empty while the skeleton stands in for the value. */
function tileValue(label: string): string {
  return within(tile(label)).queryByText(/^\d+$/)?.textContent ?? '';
}

function rowFor(entry: RosterEntry): HTMLElement {
  return screen.getByText(labelOf(entry)).closest('tr') as HTMLElement;
}

function identityCell(row: HTMLElement): HTMLElement {
  return within(row).getAllByRole('cell')[0] as HTMLElement;
}

beforeEach(() => {
  fixture.officer.lastCalledOn = daysAgo(1);
  fixture.rows = [];
  fixture.fail = false;
  fixture.gate = null;
  fixture.release = null;
});

describe('ShepherdingRosterPage identity card and count tiles (FR-59a)', () => {
  it('shows the officer identity card and the five tiles for the full roster read', async () => {
    fixture.rows = ROSTER;
    renderRoster();

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Efua Boateng' }),
    ).toBeInTheDocument();
    expect(screen.getByText('M-2001 · Female · 47y')).toBeInTheDocument();
    expect(await screen.findByText('5 assignments · 4 conversations')).toBeInTheDocument();

    expect(tileValue('Assigned')).toBe('5');
    expect(tileValue('Attempts')).toBe('10');
    expect(tileValue('Conversations')).toBe('4');
    expect(tileValue('Never called')).toBe('1');
    expect(tileValue('Follow-ups')).toBe('3');

    // The captions are FR-59a's contract, not decoration.
    expect(screen.getByText('Active assignments')).toBeInTheDocument();
    expect(screen.getByText('In this window')).toBeInTheDocument();
    expect(screen.getByText('Outcome reached')).toBeInTheDocument();
    expect(screen.getByText('On this roster')).toBeInTheDocument();
    expect(screen.getByText('Never or quiet > 30 days')).toBeInTheDocument();
  });

  it('renders a zero tile as 0 instead of hiding it', async () => {
    fixture.rows = ZERO_ROSTER;
    renderRoster();

    await screen.findByText(labelOf(ZERO_ROSTER[0]!));

    expect(tileValue('Assigned')).toBe('1');
    expect(tileValue('Attempts')).toBe('1');
    expect(tileValue('Conversations')).toBe('0');
    expect(tileValue('Never called')).toBe('0');
    expect(tileValue('Follow-ups')).toBe('0');
    expect(screen.getByText('1 assignment in this view')).toBeInTheDocument();
  });

  it('computes the tiles from the full read, not the filtered view', async () => {
    const user = userEvent.setup();
    fixture.rows = ROSTER;
    renderRoster();

    await screen.findByText(labelOf(ROSTER[0]!));

    await user.click(screen.getByRole('tab', { name: 'Never called' }));

    await waitFor(() => expect(screen.queryByText(labelOf(ROSTER[1]!))).not.toBeInTheDocument());

    // The table narrowed to one row, and the footer says so...
    expect(screen.getByText('1 assignment in this view')).toBeInTheDocument();
    // ...while every tile still reports the full read.
    expect(tileValue('Assigned')).toBe('5');
    expect(tileValue('Attempts')).toBe('10');
    expect(tileValue('Conversations')).toBe('4');
    expect(tileValue('Never called')).toBe('1');
    expect(tileValue('Follow-ups')).toBe('3');
  });

  it('shows a tile skeleton, not an invented zero, while the roster read is pending', async () => {
    fixture.rows = ROSTER;
    fixture.gate = new Promise<void>((resolve) => {
      fixture.release = resolve;
    });
    renderRoster();

    await screen.findByRole('group', { name: 'Assigned' });
    expect(tileValue('Assigned')).toBe('');
    expect(tileValue('Follow-ups')).toBe('');

    fixture.release?.();

    await waitFor(() => expect(tileValue('Assigned')).toBe('5'));
  });
});

describe('ShepherdingRosterPage roster search (FR-59a)', () => {
  it('narrows by member name and member number, ANDs with the filter and keeps the tab', async () => {
    const user = userEvent.setup();
    fixture.rows = ROSTER;
    renderRoster();

    await screen.findByText(labelOf(ROSTER[0]!));
    const search = screen.getByLabelText('Search the roster by name or member number');

    // Name: case-insensitive substring over the composed member name.
    await user.type(search, 'kofi');
    await waitFor(() => expect(screen.queryByText(labelOf(ROSTER[0]!))).not.toBeInTheDocument());
    expect(screen.getByText(labelOf(ROSTER[1]!))).toBeInTheDocument();
    expect(screen.getByText('1 assignment in this view')).toBeInTheDocument();

    // The search never narrows the tiles.
    expect(tileValue('Assigned')).toBe('5');
    expect(tileValue('Attempts')).toBe('10');

    // Member number, not just the name.
    await user.clear(search);
    await user.type(search, 'm-1004');
    await waitFor(() => expect(screen.queryByText(labelOf(ROSTER[1]!))).not.toBeInTheDocument());
    expect(screen.getByText(labelOf(ROSTER[3]!))).toBeInTheDocument();

    // AND with the active filter: "Never called" plus a called member is empty.
    await user.clear(search);
    await user.click(screen.getByRole('tab', { name: 'Never called' }));
    await user.type(search, 'M-1002');

    expect(await screen.findByText('No members match')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Never called' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(tileValue('Assigned')).toBe('5');

    // The same search with a never-called member matches.
    await user.clear(search);
    await user.type(search, 'm-1001');
    expect(await screen.findByText(labelOf(ROSTER[0]!))).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Never called' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('ShepherdingRosterPage call badges (FR-59a)', () => {
  it('badges never called and quiet rows, and leaves the 30-day row on the plain date', async () => {
    fixture.rows = ROSTER;
    renderRoster();

    await screen.findByText(labelOf(ROSTER[0]!));

    // Never called: the badge under the name, alongside the muted last-called cell.
    const neverRow = rowFor(ROSTER[0]!);
    expect(within(identityCell(neverRow)).getByText('Never called')).toBeInTheDocument();
    expect(within(neverRow).getAllByText('Never called')).toHaveLength(2);

    // 31 and 45 days are quiet; the day count is the UTC whole-day difference.
    expect(within(identityCell(rowFor(ROSTER[1]!))).getByText('Quiet 31d')).toBeInTheDocument();
    expect(within(identityCell(rowFor(ROSTER[4]!))).getByText('Quiet 45d')).toBeInTheDocument();

    // Exactly 30 days is FR-60's boundary: no badge, the plain date in the cell.
    const boundaryRow = rowFor(ROSTER[2]!);
    expect(within(identityCell(boundaryRow)).queryByText(/^Quiet \d+d$/)).toBeNull();
    expect(within(identityCell(boundaryRow)).queryByText('Never called')).toBeNull();
    expect(
      within(boundaryRow).getByText(
        formatCalendarDate(ROSTER[2]!.lastCalledOn, DEFAULT_DATE_TIME_PREFERENCE),
      ),
    ).toBeInTheDocument();
  });
});

describe('ShepherdingRosterPage row overflow (FR-59a)', () => {
  it('keeps Log call visible and wires Contacts, Reassign and End in one menu', async () => {
    const user = userEvent.setup();
    fixture.rows = ROSTER;
    renderRoster();

    await screen.findByText(labelOf(ROSTER[1]!));
    const row = rowFor(ROSTER[1]!);
    const label = labelOf(ROSTER[1]!);

    // Log call stays the row's visible primary action.
    await user.click(within(row).getByRole('button', { name: 'Log call' }));
    expect(await screen.findByText('Log call dialog opened')).toBeInTheDocument();

    const trigger = within(row).getByRole('button', { name: `More actions for ${label}` });

    await user.click(trigger);
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Contacts', 'Reassign', 'End']);

    await user.click(screen.getByRole('menuitem', { name: 'Contacts' }));
    expect(await screen.findByText('Contacts dialog opened')).toBeInTheDocument();

    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Reassign' }));
    expect(await screen.findByText('Reassign dialog opened')).toBeInTheDocument();

    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'End' }));
    expect(
      await screen.findByText(`Confirm: End the assignment for ${label}?`),
    ).toBeInTheDocument();
  });
});

describe('ShepherdingRosterPage roster failure (FR-59a)', () => {
  it('shows the roster error message and suppresses the tiles', async () => {
    fixture.rows = ROSTER;
    fixture.fail = true;
    renderRoster();

    expect(await screen.findByText('The roster could not be loaded')).toBeInTheDocument();
    expect(screen.getByText('The roster read failed.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Roster counts' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Assigned' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Follow-ups' })).toBeNull();
  });
});
