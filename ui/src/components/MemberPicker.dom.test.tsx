import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemberPicker } from '../components/MemberPicker';
import { renderWithProviders } from '../test/render';

/**
 * The first test in the DOM lane, and the shape every later one follows: the real
 * picker, the real session provider, a mocked API module. No dispatcher hacks, no
 * option-text stubs — this asserts what an operator sees and what the form receives.
 */
const members = [
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

vi.mock('../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/members')>();
  return { ...actual, searchMembers: vi.fn(async () => ({ items: members })) };
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

function Harness({ onPick }: { onPick: (memberNo: string | null) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <>
      <MemberPicker
        value={value}
        onChange={(memberNo) => {
          setValue(memberNo);
          onPick(memberNo);
        }}
        label="Member"
      />
      <output data-testid="picked">{value ?? 'none'}</output>
    </>
  );
}

describe('MemberPicker in the DOM lane', () => {
  it('shows the identity label and reports the picked member number', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    renderWithProviders(<Harness onPick={onPick} />);

    const combobox = screen.getByRole('combobox', { name: 'Member' });
    await user.click(combobox);
    await user.type(combobox, 'Adjoa');

    const option = await screen.findByRole('option', { name: /M-1042/ });
    expect(option).toHaveTextContent('M-1042 · Adjoa Mensah (F, 12y)');

    await user.click(option);

    await waitFor(() => expect(screen.getByTestId('picked')).toHaveTextContent('M-1042'));
    expect(onPick).toHaveBeenLastCalledWith('M-1042');
  });

  it('does not search until something is typed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness onPick={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: 'Member' }));
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
