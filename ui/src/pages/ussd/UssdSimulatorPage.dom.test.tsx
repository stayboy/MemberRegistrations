import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendUssdSession, type UssdSimulatorResponse } from '../../api/ussd';
import { isLocalTools } from '../../env/localTools';
import { renderWithProviders } from '../../test/render';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { UssdSimulatorPage } from './UssdSimulatorPage';

vi.mock('../../env/localTools', () => ({ isLocalTools: vi.fn(() => true) }));

vi.mock('../../api/ussd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/ussd')>();
  return { ...actual, sendUssdSession: vi.fn() };
});

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

const FRAME: UssdSimulatorResponse = {
  provider: 'nalo',
  sessionId: 'session-1',
  text: 'Welcome. 1 Register, 5 My Profile',
  done: false,
  state: 'main_menu',
  wire: { action: 'open', menu: ['1', '5'] },
};

const sendUssdSessionMock = vi.mocked(sendUssdSession);
const isLocalToolsMock = vi.mocked(isLocalTools);

beforeEach(() => {
  isLocalToolsMock.mockReset();
  isLocalToolsMock.mockReturnValue(true);
  sendUssdSessionMock.mockReset();
  sendUssdSessionMock.mockResolvedValue(FRAME);
});

afterEach(() => {
  window.sessionStorage.clear();
});

function renderPage(): void {
  renderWithProviders(
    <MemoryRouter initialEntries={['/ussd/simulator']}>
      <ThemeProvider>
        <UssdSimulatorPage />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

async function openActions(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Actions' }));
}

describe('UssdSimulatorPage console', () => {
  it('renders a twelve-key keypad', () => {
    renderPage();

    const keys = screen.getAllByRole('button', { name: /^Key / });
    expect(keys).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Key *' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Key #' })).toBeInTheDocument();
    // The caption sits outside the live screen; no frame has been sent yet.
    expect(screen.getByText('state=none')).toBeInTheDocument();
  });

  it('sends exactly one frame for a keypress, with the default provider and phone', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Key 1' }));

    await waitFor(() => expect(sendUssdSessionMock).toHaveBeenCalledTimes(1));
    expect(sendUssdSessionMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ provider: 'nalo', phone: '0240000000', input: '1' }),
    );
    expect(sendUssdSessionMock.mock.calls[0]?.[1]).not.toHaveProperty('sessionId');
  });

  it('appends one log block per frame with the request, state and no gateway secret', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Key 1' }));

    const log = screen.getByRole('log', { name: 'Frame log' });
    await waitFor(() => expect(log).toHaveTextContent('POST /dev/ussd/session'));
    expect(log).toHaveTextContent('nalo · 0240000000');
    expect(log).toHaveTextContent('session new');
    expect(log).toHaveTextContent('input "1"');
    expect(log).toHaveTextContent('state=main_menu');
    expect(log).toHaveTextContent('Welcome. 1 Register, 5 My Profile');
    expect(log).not.toHaveTextContent('secret');
    // The handset caption repeats the state outside the log; `span` scopes it away from the pre.
    expect(screen.getByText('state=main_menu', { selector: 'span' })).toBeInTheDocument();
  });

  it('clears only the log from the action row', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Key 1' }));
    await waitFor(() =>
      expect(screen.getByRole('log', { name: 'Frame log' })).toHaveTextContent(
        'POST /dev/ussd/session',
      ),
    );

    await openActions(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Clear log' }));

    await waitFor(() =>
      expect(screen.getByRole('log', { name: 'Frame log' })).toHaveTextContent(
        'No frame yet. Press a key or Send.',
      ),
    );
    expect(screen.getByRole('log', { name: 'Frame log' })).not.toHaveTextContent(
      'POST /dev/ussd/session',
    );
  });

  it('starts a new session and clears the log from the action row', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Key 1' }));
    await waitFor(() => expect(sendUssdSessionMock).toHaveBeenCalledTimes(1));

    await openActions(user);
    await user.click(await screen.findByRole('menuitem', { name: 'New session' }));

    await waitFor(() =>
      expect(screen.getByRole('log', { name: 'Frame log' })).toHaveTextContent(
        'No frame yet. Press a key or Send.',
      ),
    );

    // The cleared session id is not sent with the next frame.
    await user.click(screen.getByRole('button', { name: 'Key 1' }));
    await waitFor(() => expect(sendUssdSessionMock).toHaveBeenCalledTimes(2));
    expect(sendUssdSessionMock.mock.calls[1]?.[1]).not.toHaveProperty('sessionId');
  });

  it('renders the unavailable notice and no keypad when the local gate is closed', () => {
    isLocalToolsMock.mockReturnValue(false);
    renderPage();

    expect(screen.getByText(/A deployed build cannot drive/)).toBeVisible();
    expect(screen.getByText(/VITE_USSD_CONSOLE=true/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Key 1' })).not.toBeInTheDocument();
    expect(sendUssdSessionMock).not.toHaveBeenCalled();
  });
});
