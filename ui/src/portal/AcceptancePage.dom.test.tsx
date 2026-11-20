import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptMemberVerification } from '../api/members';
import { ApiError } from '../api/errors';
import { renderWithProviders } from '../test/render';
import { AcceptancePage, tokenFromHash } from './AcceptancePage';

/**
 * FR-25b / MR-51: the public acceptance page reads the token from the URL
 * fragment, asks for six digits, posts them with no session header, and shows
 * only the masked destination. The link alone verifies nothing and no member
 * data is rendered.
 */
vi.mock('../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/members')>();
  return { ...actual, acceptMemberVerification: vi.fn() };
});

const acceptMock = vi.mocked(acceptMemberVerification);

beforeEach(() => {
  acceptMock.mockReset();
  acceptMock.mockResolvedValue({ channel: 'phone', masked: '+233 *** 01' });
});

afterEach(() => {
  window.location.hash = '';
});

describe('tokenFromHash', () => {
  it('reads `#t=` and ignores anything else', () => {
    expect(tokenFromHash('#t=abc-123')).toBe('abc-123');
    expect(tokenFromHash('#t=abc-123&x=1')).toBe('abc-123');
    expect(tokenFromHash('')).toBe('');
    expect(tokenFromHash('#other=1')).toBe('');
  });
});

describe('the member acceptance page (FR-25b, MR-51)', () => {
  it('says the link is incomplete when the token is missing, and verifies nothing', () => {
    window.location.hash = '';
    renderWithProviders(<AcceptancePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Verify your contact' })).toBeVisible();
    expect(screen.getByText('This link is incomplete')).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(acceptMock).not.toHaveBeenCalled();
  });

  it('does not verify when the link is merely opened', () => {
    window.location.hash = '#t=tok-opened';
    renderWithProviders(<AcceptancePage />);

    expect(screen.getByLabelText('Six-digit code')).toBeVisible();
    expect(acceptMock).not.toHaveBeenCalled();
  });

  it('posts the token and the six digits with no session and shows only the mask', async () => {
    const user = userEvent.setup();
    window.location.hash = '#t=tok-123';
    renderWithProviders(<AcceptancePage />);

    const submit = screen.getByRole('button', { name: 'Verify my contact' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Six-digit code'), '123456');
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() =>
      expect(acceptMock).toHaveBeenCalledWith('http://localhost:3000', 'tok-123', '123456'),
    );
    expect(await screen.findByText('Your contact is verified')).toBeVisible();
    expect(screen.getByText(/register now treats \+233 \*\*\* 01 as proven/)).toBeVisible();
    expect(screen.queryByText(/tok-123/)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/M-\d{4}/);
  });

  it('explains an expired code', async () => {
    const user = userEvent.setup();
    acceptMock.mockRejectedValueOnce(
      new ApiError(400, 'That code has expired', { code: 'code_expired' }),
    );
    window.location.hash = '#t=tok-expired';
    renderWithProviders(<AcceptancePage />);

    await user.type(screen.getByLabelText('Six-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify my contact' }));

    expect(
      await screen.findByText('That code has expired. Ask the office to send a new one.'),
    ).toBeVisible();
  });

  it('surfaces the remaining-attempt count the API names (MR-25, AC-MR17)', async () => {
    const user = userEvent.setup();
    acceptMock.mockRejectedValueOnce(
      new ApiError(400, 'That code is not valid; 4 attempts remain', {
        code: 'code_invalid',
        detail: 'That code is not valid; 4 attempts remain',
      }),
    );
    window.location.hash = '#t=tok-attempts';
    renderWithProviders(<AcceptancePage />);

    await user.type(screen.getByLabelText('Six-digit code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify my contact' }));

    expect(
      await screen.findByText(
        'That code is not valid; 4 attempts remain. Check the six digits and try again.',
      ),
    ).toBeVisible();
  });

  it('explains a wrong code and a rate limit', async () => {
    const user = userEvent.setup();
    acceptMock.mockRejectedValueOnce(
      new ApiError(400, 'That code is not valid', { code: 'code_invalid' }),
    );
    window.location.hash = '#t=tok-wrong';
    renderWithProviders(<AcceptancePage />);

    await user.type(screen.getByLabelText('Six-digit code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify my contact' }));
    expect(
      await screen.findByText('That code is not right. Check the six digits and try again.'),
    ).toBeVisible();

    acceptMock.mockRejectedValueOnce(new ApiError(429, 'Too many requests'));
    await user.type(screen.getByLabelText('Six-digit code'), '111111');
    await user.click(screen.getByRole('button', { name: 'Verify my contact' }));
    expect(
      await screen.findByText('Too many requests. Wait a minute and try again.'),
    ).toBeVisible();
  });
});
