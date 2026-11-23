import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudience, type AudienceItem } from '../api/audiences';
import { ApiError } from '../api/errors';
import { listMinistries } from '../api/members';
import { renderWithProviders } from '../test/render';
import { AudienceDialog } from './AudienceDialog';

/**
 * FR-42c/FR-42g, AC-57, AC-64: the audience dialog writes one custom audience —
 * a name, one operator and repeatable clause rows whose value control follows the
 * attribute — and the audience's own `409`/`422` codes surface in the dialog, not
 * on the form behind it. The summary is the API's sentence, so nothing here
 * previews or evaluates the rule.
 */

vi.mock('../api/audiences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/audiences')>();
  return { ...actual, createAudience: vi.fn() };
});

vi.mock('../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/members')>();
  return {
    ...actual,
    listMinistries: vi.fn(async () => [
      { code: 'CHR', name: 'Choir', description: null, active: true },
      { code: 'USH', name: 'Ushering', description: null, active: true },
    ]),
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

const CREATED: AudienceItem = {
  id: 'aud-young-adults',
  name: 'Young Adults',
  system: false,
  systemKey: null,
  active: true,
  rule: { operator: 'allOf', clauses: [{ attribute: 'ageBand', minYears: 18, maxYears: 35 }] },
  summary: 'Young Adults - all of age 18-35',
  createdAt: '2026-11-23T10:15:00.000Z',
  createdBy: 'officer_ada',
  updatedAt: '2026-11-23T10:15:00.000Z',
  updatedBy: 'officer_ada',
};

const createAudienceMock = vi.mocked(createAudience);
const listMinistriesMock = vi.mocked(listMinistries);

const onCreated = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
  createAudienceMock.mockReset();
  createAudienceMock.mockResolvedValue(CREATED);
  listMinistriesMock.mockClear();
  onCreated.mockReset();
  onClose.mockReset();
});

function renderDialog(): void {
  renderWithProviders(<AudienceDialog onClose={onClose} onCreated={onCreated} />);
}

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  combobox: HTMLElement,
  option: string,
): Promise<void> {
  await user.click(combobox);
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('AudienceDialog', () => {
  it('creates a custom audience from its name, operator and ministry clause', async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'New audience' });
    expect(within(dialog).getByRole('heading', { name: 'New audience' })).toBeVisible();

    await user.type(screen.getByLabelText(/^Name/), '  Choir team  ');
    await chooseOption(
      user,
      screen.getByRole('combobox', { name: 'Clause 1 ministry' }),
      'CHR · Choir',
    );

    await user.click(screen.getByRole('button', { name: 'Create audience' }));

    expect(createAudienceMock).toHaveBeenCalledTimes(1);
    const [baseUrl, token, input] = createAudienceMock.mock.calls[0] ?? [];
    expect(baseUrl).toBeDefined();
    expect(token).toBe('dom-lane-session');
    expect(input).toEqual({
      name: 'Choir team',
      rule: { operator: 'allOf', clauses: [{ attribute: 'ministry', ministryCode: 'CHR' }] },
    });
    expect(onCreated).toHaveBeenCalledWith(CREATED);
    expect(onClose).toHaveBeenCalled();
  });

  it('adds and removes clause rows and sends the operator and attribute values', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/^Name/), 'Everyone but the choir');
    await chooseOption(user, screen.getByRole('combobox', { name: 'Operator' }), 'Any of');
    await user.click(screen.getByRole('button', { name: 'Add clause' }));

    await chooseOption(
      user,
      screen.getByRole('combobox', { name: 'Clause 2 attribute' }),
      'Presbyter',
    );
    // A presbyter row carries no value control; the clause is complete as it is.
    expect(screen.queryByRole('combobox', { name: 'Clause 2 ministry' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add clause' }));
    await chooseOption(
      user,
      screen.getByRole('combobox', { name: 'Clause 3 attribute' }),
      'Membership status',
    );
    await chooseOption(
      user,
      screen.getByRole('combobox', { name: 'Clause 3 membership status' }),
      'Visitor',
    );

    await user.click(screen.getByRole('button', { name: 'Remove clause 1' }));

    await user.click(screen.getByRole('button', { name: 'Create audience' }));

    const [, , input] = createAudienceMock.mock.calls[0] ?? [];
    expect(input).toEqual({
      name: 'Everyone but the choir',
      rule: {
        operator: 'anyOf',
        clauses: [
          { attribute: 'presbyter', value: true },
          { attribute: 'membershipStatus', value: 'visitor' },
        ],
      },
    });
  });

  it('sends an age band and a gender clause', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/^Name/), 'Young adults');
    await chooseOption(
      user,
      screen.getByRole('combobox', { name: 'Clause 1 attribute' }),
      'Age band',
    );
    await user.type(screen.getByLabelText('Clause 1 minimum age'), '18');
    await user.type(screen.getByLabelText('Clause 1 maximum age'), '35');

    await user.click(screen.getByRole('button', { name: 'Add clause' }));
    await chooseOption(
      user,
      screen.getByRole('combobox', { name: 'Clause 2 attribute' }),
      'Gender',
    );
    await chooseOption(user, screen.getByRole('combobox', { name: 'Clause 2 gender' }), 'Female');

    await user.click(screen.getByRole('button', { name: 'Create audience' }));

    const [, , input] = createAudienceMock.mock.calls[0] ?? [];
    expect(input).toEqual({
      name: 'Young adults',
      rule: {
        operator: 'allOf',
        clauses: [
          { attribute: 'ageBand', minYears: 18, maxYears: 35 },
          { attribute: 'gender', value: 'female' },
        ],
      },
    });
  });

  it('refuses a blank name, an empty rule and an inverted age band before sending', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Create audience' }));
    expect(await screen.findByText('Name is required.')).toBeVisible();
    expect(screen.getByText('Choose a ministry.')).toBeVisible();
    expect(createAudienceMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^Name/), 'Inverted');
    await chooseOption(
      user,
      screen.getByRole('combobox', { name: 'Clause 1 attribute' }),
      'Age band',
    );
    await user.type(screen.getByLabelText('Clause 1 minimum age'), '40');
    await user.type(screen.getByLabelText('Clause 1 maximum age'), '18');
    await user.click(screen.getByRole('button', { name: 'Create audience' }));

    expect(
      await screen.findByText('The maximum age must not be below the minimum age.'),
    ).toBeVisible();
    expect(createAudienceMock).not.toHaveBeenCalled();
  });

  it('surfaces a duplicate name against the Name field and keeps the values', async () => {
    createAudienceMock.mockRejectedValue(
      new ApiError(409, 'An audience named Choir team already exists', {
        code: 'audience_name_in_use',
      }),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/^Name/), 'Choir team');
    await chooseOption(
      user,
      screen.getByRole('combobox', { name: 'Clause 1 ministry' }),
      'CHR · Choir',
    );
    await user.click(screen.getByRole('button', { name: 'Create audience' }));

    expect(await screen.findByText('An audience named Choir team already exists')).toBeVisible();
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Choir team');
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'New audience' })).toBeVisible();
  });

  it('surfaces audience_system and a 422 in the dialog rather than the form', async () => {
    createAudienceMock.mockRejectedValueOnce(
      new ApiError(409, 'A system audience is read-only', { code: 'audience_system' }),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/^Name/), 'Everyone');
    await chooseOption(
      user,
      screen.getByRole('combobox', { name: 'Clause 1 ministry' }),
      'CHR · Choir',
    );
    await user.click(screen.getByRole('button', { name: 'Create audience' }));

    const banner = await screen.findByText('A system audience is read-only');
    expect(banner).toBeVisible();
    expect(screen.getByText('The audience was not created')).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();

    createAudienceMock.mockRejectedValueOnce(
      new ApiError(422, 'clauses.0.ministryCode names an unknown ministry'),
    );
    await user.click(screen.getByRole('button', { name: 'Create audience' }));

    expect(
      await screen.findByText('clauses.0.ministryCode names an unknown ministry'),
    ).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'New audience' })).toBeVisible();
  });
});
