import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { listGuardianCandidates, type MemberGuardian } from '../../api/members';
import {
  approveRegistrationRequest,
  listRegistrationRequests,
  rejectRegistrationRequest,
  type RegistrationRequest,
} from '../../api/ussd';
import { DATE_TIME_STORAGE_KEY, DateTimeProvider } from '../../shell/DateTimeProvider';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { renderWithProviders } from '../../test/render';
import { UssdRegistrationsPage } from './UssdRegistrationsPage';

/**
 * FR-82 / MR-50 / MR-53: the approve dialog shows the caller's masked number and
 * asks whether it is the registrant's own or borrowed. `own` binds it as the
 * member's contact and needs no guardian; `borrowed` requires one, and the
 * payload carries `phoneOwnership` either way.
 */
vi.mock('../../api/ussd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/ussd')>();
  return {
    ...actual,
    listRegistrationRequests: vi.fn(),
    approveRegistrationRequest: vi.fn(),
    rejectRegistrationRequest: vi.fn(),
  };
});

vi.mock('../../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/members')>();
  return { ...actual, listGuardianCandidates: vi.fn() };
});

vi.mock('../../api/events', () => ({
  getEvent: vi.fn(async () => ({
    event: { id: 'event-1', name: 'Sunday Service' },
    etag: null,
  })),
}));

vi.mock('../../api/gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/gateway')>();
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

const PENDING: RegistrationRequest = {
  id: 'req-1',
  reference: 'REG-0001',
  firstName: 'Kojo',
  lastName: 'Owusu',
  phoneHash: 'phone-hash-1',
  phoneMasked: '+233 *** 01',
  eventId: 'event-1',
  sessionDate: '2026-11-16',
  status: 'pending',
  createdAt: '2026-11-16T09:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
  memberNo: null,
};

const GUARDIANS: MemberGuardian[] = [
  { memberNo: 'G-1001', name: 'Adwoa Mensah', contactMasked: '***01', via: [] },
  { memberNo: 'G-1002', name: 'Kwesi Addo', contactMasked: '***42', via: [] },
];

const listRegistrationRequestsMock = vi.mocked(listRegistrationRequests);
const approveRegistrationRequestMock = vi.mocked(approveRegistrationRequest);
const rejectRegistrationRequestMock = vi.mocked(rejectRegistrationRequest);
const listGuardianCandidatesMock = vi.mocked(listGuardianCandidates);

beforeEach(() => {
  window.localStorage.setItem(
    DATE_TIME_STORAGE_KEY,
    JSON.stringify({ dateStyle: 'dmy', timeCycle: 'h24' }),
  );

  listRegistrationRequestsMock.mockReset();
  listRegistrationRequestsMock.mockResolvedValue([PENDING]);
  approveRegistrationRequestMock.mockReset();
  approveRegistrationRequestMock.mockResolvedValue({
    ...PENDING,
    status: 'approved',
    phoneMasked: null,
    decidedBy: 'efua',
    decidedAt: '2026-11-18T10:00:00.000Z',
    memberNo: 'REQ-APPROVED-9',
  });
  rejectRegistrationRequestMock.mockReset();
  listGuardianCandidatesMock.mockReset();
  listGuardianCandidatesMock.mockResolvedValue(GUARDIANS);
});

afterEach(() => {
  window.localStorage.clear();
});

function renderPage(): void {
  renderWithProviders(
    <MemoryRouter initialEntries={['/ussd/registrations']}>
      <ThemeProvider>
        <DateTimeProvider>
          <UssdRegistrationsPage />
        </DateTimeProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

async function openApproveDialog(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: 'Approve' }));
  return screen.findByRole('dialog', { name: 'Approve the registration' });
}

async function chooseGuardian(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  memberNo: string,
): Promise<void> {
  await user.click(within(dialog).getByRole('combobox', { name: /^Guardian/ }));
  await user.click(await screen.findByRole('option', { name: new RegExp(memberNo) }));
}

describe('UssdRegistrationsPage approval (FR-82, MR-50, MR-53)', () => {
  it('shows the masked number and approves a member number with no guardian when the number is own', async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await openApproveDialog(user);
    expect(within(dialog).getByTestId('registration-phone-masked')).toHaveTextContent(
      '+233 *** 01',
    );
    expect(within(dialog).queryByRole('combobox', { name: /^Guardian/ })).not.toBeInTheDocument();
    // The guardian list is not read for the own choice.
    expect(listGuardianCandidatesMock).not.toHaveBeenCalled();

    const approve = within(dialog).getByRole('button', { name: 'Approve and create member' });
    await user.type(within(dialog).getByLabelText('Member number'), 'REQ-APPROVED-9');
    expect(approve).toBeEnabled();
    await user.click(approve);

    await waitFor(() => expect(approveRegistrationRequestMock).toHaveBeenCalledTimes(1));
    expect(approveRegistrationRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'req-1',
      { memberNo: 'REQ-APPROVED-9', phoneOwnership: 'own' },
    );
  });

  it('disables Own when the retained number cannot be read and starts on Borrowed (MR-53)', async () => {
    const user = userEvent.setup();
    listRegistrationRequestsMock.mockResolvedValue([{ ...PENDING, phoneMasked: null }]);
    renderPage();

    const dialog = await openApproveDialog(user);
    expect(within(dialog).getByTestId('registration-phone-masked')).toHaveTextContent(
      'Not available',
    );
    expect(within(dialog).getByRole('radio', { name: /Own/ })).toBeDisabled();
    expect(within(dialog).getByRole('radio', { name: /Borrowed/ })).toBeChecked();
    // The borrowed choice needs a guardian, so the picker is present at once.
    expect(within(dialog).getByRole('combobox', { name: /^Guardian/ })).toBeInTheDocument();
  });

  it('requires a guardian when the number is borrowed and sends both', async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await openApproveDialog(user);
    const approve = within(dialog).getByRole('button', { name: 'Approve and create member' });
    await user.type(within(dialog).getByLabelText('Member number'), 'REQ-APPROVED-9');
    await user.click(within(dialog).getByRole('radio', { name: /Borrowed/ }));

    // The borrowed choice reveals the required guardian picker.
    await waitFor(() => expect(listGuardianCandidatesMock).toHaveBeenCalled());
    expect(listGuardianCandidatesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      expect.anything(),
    );
    expect(approve).toBeDisabled();

    await user.click(within(dialog).getByRole('combobox', { name: /^Guardian/ }));
    expect(
      await screen.findByText('Choose the guardian this member is reached through.'),
    ).toBeVisible();
    await user.click(await screen.findByRole('option', { name: /G-1001/ }));

    expect(approve).toBeEnabled();
    await user.click(approve);

    await waitFor(() => expect(approveRegistrationRequestMock).toHaveBeenCalledTimes(1));
    expect(approveRegistrationRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'req-1',
      { memberNo: 'REQ-APPROVED-9', phoneOwnership: 'borrowed', guardianMemberNo: 'G-1001' },
    );
  });

  it('surfaces an ineligible guardian and keeps the request pending', async () => {
    const user = userEvent.setup();
    approveRegistrationRequestMock.mockRejectedValueOnce(
      new ApiError(422, 'Member G-1002 is under 18 and cannot be a guardian'),
    );
    renderPage();

    const dialog = await openApproveDialog(user);
    await user.type(within(dialog).getByLabelText('Member number'), 'REQ-APPROVED-9');
    await user.click(within(dialog).getByRole('radio', { name: /Borrowed/ }));
    await chooseGuardian(user, dialog, 'G-1002');
    await user.click(within(dialog).getByRole('button', { name: 'Approve and create member' }));

    expect(
      await screen.findByText('Member G-1002 is under 18 and cannot be a guardian'),
    ).toBeVisible();
    // The dialog stays open: nothing was approved, so the operator can pick another adult.
    expect(screen.getByRole('dialog', { name: 'Approve the registration' })).toBeVisible();
    expect(approveRegistrationRequestMock).toHaveBeenCalledTimes(1);
  });
});
