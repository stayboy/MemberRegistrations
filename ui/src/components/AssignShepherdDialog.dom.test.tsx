import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { renderWithProviders } from '../test/render';
import { AssignShepherdDialog } from './AssignShepherdDialog';

/**
 * The roster's `Assign member` page action opens this dialog in its fixed-officer mode: the
 * officer is the roster's officer and the member is the one thing the operator chooses. The
 * assertions are the POST body (the same contract FR-63 fixes) and the local validation that
 * keeps an empty assignment off the wire.
 */

const MEMBERS = [
  {
    memberNo: 'M-1042',
    firstName: 'Adjoa',
    lastName: 'Mensah',
    otherNames: null,
    gender: 'female',
    age: 12,
    ageMonths: 144,
    placeOfResidence: null,
    joinedOn: null,
    isPresbyter: false,
    archivedAt: null,
    contactCount: 0,
    ministries: [],
  },
];

const assignMember = vi.hoisted(() =>
  vi.fn(async (_baseUrl: string, _token: string) => ({ id: 'assignment-1' })),
);

vi.mock('../api/shepherding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/shepherding')>();
  return {
    ...actual,
    assignMember: assignMember as unknown as typeof actual.assignMember,
  };
});

vi.mock('../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/members')>();
  return { ...actual, searchMembers: vi.fn(async () => ({ items: MEMBERS })) };
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

function renderDialog(onAssigned = vi.fn(), onClose = vi.fn()) {
  renderWithProviders(
    <DateTimeProvider>
      <AssignShepherdDialog
        fixedOfficer={{ memberNo: 'M-2001', memberName: 'Efua Boateng (Female, 47y)' }}
        onClose={onClose}
        onAssigned={onAssigned}
      />
    </DateTimeProvider>,
  );
  return { onAssigned, onClose };
}

describe('AssignShepherdDialog fixed-officer mode (FR-59a page action, FR-63)', () => {
  it('assigns the chosen member to the fixed officer in one POST', async () => {
    const user = userEvent.setup();
    const { onAssigned, onClose } = renderDialog();

    // The member is the subject; the officer is fixed rather than picked.
    expect(screen.getByText('Assign a member')).toBeInTheDocument();
    expect(screen.getByText('Efua Boateng (Female, 47y) · M-2001')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Officer' })).toBeNull();

    const memberBox = screen.getByRole('combobox', { name: 'Member' });
    await user.click(memberBox);
    await user.type(memberBox, 'Adjoa');
    await user.click(await screen.findByRole('option', { name: /M-1042/ }));

    await user.type(screen.getByLabelText('Reason'), 'Moved into the district last month.');
    await user.click(screen.getByRole('button', { name: 'Assign' }));

    await waitFor(() => expect(assignMember).toHaveBeenCalledTimes(1));
    expect(assignMember).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        officerMemberNo: 'M-2001',
        memberNo: 'M-1042',
        reason: 'Moved into the district last month.',
      }),
    );
    expect(onAssigned).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('refuses to submit with no member chosen', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Reason'), 'Moved into the district last month.');
    await user.click(screen.getByRole('button', { name: 'Assign' }));

    expect(
      await screen.findByText('Choose the member this officer will shepherd.'),
    ).toBeInTheDocument();
    expect(assignMember).not.toHaveBeenCalled();
  });
});
