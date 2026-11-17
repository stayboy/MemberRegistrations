import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { renderWithProviders } from '../test/render';
import { DateTimeMenu } from './DateTimeMenu';

/**
 * The date/time formatting spec: the sidebar's single **Date and time** entry opens
 * its full settings menu "by click or right-click, as a context menu". Fluent's
 * `openOnContext` gave only the right-click half - a left click did nothing, which
 * is the defect these cases pin - so both routes are asserted here, on the real
 * component with the real providers.
 */
function renderMenu(collapsed = false): void {
  renderWithProviders(
    <MemoryRouter>
      <DateTimeProvider>
        <DateTimeMenu collapsed={collapsed} />
      </DateTimeProvider>
    </MemoryRouter>,
  );
}

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: /^Date and time:/ });
}

/** The three things the menu promises: a Date group, a Time group and the route. */
async function expectFullMenu(): Promise<void> {
  const menu = await screen.findByRole('menu');
  expect(menu).toBeVisible();
  expect(screen.getByText('Date format')).toBeVisible();
  expect(screen.getByText('Time format')).toBeVisible();
  expect(screen.getByRole('menuitem', { name: 'Open settings' })).toBeVisible();
}

describe('DateTimeMenu', () => {
  it('opens the full settings menu on a left click', async () => {
    const user = userEvent.setup();
    renderMenu();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(trigger());

    await expectFullMenu();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the same menu on a right click', async () => {
    renderMenu();

    fireEvent.contextMenu(trigger());

    await expectFullMenu();
  });

  it('toggles closed on a second left click', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());
    await expectFullMenu();

    await user.click(trigger());

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens from the collapsed icon button too, by click and by right click', async () => {
    const user = userEvent.setup();
    renderMenu(true);

    const icon = screen.getByRole('button', { name: /^Date and time:/ });
    await user.click(icon);
    await expectFullMenu();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.contextMenu(icon);
    await expectFullMenu();
  });
});
