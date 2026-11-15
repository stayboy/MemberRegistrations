import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@fluentui/react-components';
import { AddRegular, ArrowClockwiseRegular, ArrowImportRegular, ArrowLeftRegular } from '@fluentui/react-icons';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { PageFrame } from './PageFrame';
import type { PageAction } from './PageActions';

/**
 * FR-9a / D12 / AC-50: the action row's one-or-many rule and its surface utilities.
 *
 * - one verb renders as a visible Fluent `Button` (icon + label) and no `Actions` menu;
 * - two or more verbs render in one `Actions` menu and no standalone verb button;
 * - a `Refresh`-class utility is a bare icon button with an accessible name, rendered first in
 *   the row — before `Back`, before the verb, before the menu — so it never interrupts a run of
 *   buttons, is never a menu item, and is never counted towards the two-or-more rule — so a page
 *   whose only control is a utility shows the icon and renders no menu;
 * - verbs keep their disabling condition in either shape.
 */

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

function renderFrame(actions: readonly PageAction[], controls?: ReactNode) {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/members']}>
      <ThemeProvider>
        <PageFrame
          sectionId="members"
          title="Members"
          submenu="All members"
          actions={actions}
          controls={controls}
          hideBadge
        >
          <div>body</div>
        </PageFrame>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

function addMember(onSelect = vi.fn(), disabled = false): PageAction {
  return { id: 'add-member', kind: 'verb', label: 'Add member', icon: <AddRegular />, onSelect, disabled };
}

function refresh(onSelect = vi.fn(), disabled = false): PageAction {
  return {
    id: 'refresh',
    kind: 'utility',
    label: 'Refresh',
    icon: <ArrowClockwiseRegular />,
    onSelect,
    disabled,
  };
}

function importAttendance(): PageAction {
  return {
    id: 'import-attendance',
    kind: 'verb',
    label: 'Import attendance',
    icon: <ArrowImportRegular />,
    onSelect: vi.fn(),
  };
}

/** A page's `Back` navigation control, as the series and event detail pages pass it. */
function backToSeries(): ReactNode {
  return <Button icon={<ArrowLeftRegular />}>Back to series</Button>;
}

/** True when `first` precedes `second` in document order (FR-9a's render order). */
function precedes(first: HTMLElement, second: HTMLElement): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/** The row's controls in document order, by accessible name (FR-9a's render order). */
function rowOrder(): string[] {
  return screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? button.textContent ?? '');
}

describe('PageFrame action row (FR-9a)', () => {
  it('renders exactly one verb as a visible button and no Actions menu', () => {
    renderFrame([addMember()]);

    expect(screen.getByRole('button', { name: 'Add member' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls the sole verb when the visible button is pressed', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderFrame([addMember(onSelect)]);

    await user.click(screen.getByRole('button', { name: 'Add member' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('groups two or more verbs in the Actions menu, with no standalone verb button', async () => {
    const user = userEvent.setup();
    renderFrame([importAttendance(), addMember()]);

    // The verbs are not visible controls of their own...
    expect(screen.queryByRole('button', { name: 'Import attendance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument();

    // ...they live in the one menu.
    const trigger = screen.getByRole('button', { name: 'Actions' });
    await user.click(trigger);

    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Import attendance', 'Add member']);
  });

  it('renders a utility alone as a named icon button and no menu', () => {
    renderFrame([refresh()]);

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // A bare icon: no visible text node, the accessible name is the label.
    expect(screen.getByRole('button', { name: 'Refresh' }).textContent).toBe('');
  });

  it('puts the utility immediately before the sole verb and still renders no menu', () => {
    renderFrame([addMember(), refresh()]);

    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual([
      'Refresh',
      'Add member',
    ]);
    // FR-9a: the verb holds the trailing edge, so the utility sits before it, never after.
    expect(
      precedes(
        screen.getByRole('button', { name: 'Refresh' }),
        screen.getByRole('button', { name: 'Add member' }),
      ),
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps the utility outside a two-verb menu and immediately before it', async () => {
    const user = userEvent.setup();
    renderFrame([importAttendance(), addMember(), refresh()]);

    await user.click(screen.getByRole('button', { name: 'Actions' }));

    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Import attendance', 'Add member']);
    expect(screen.queryByRole('menuitem', { name: 'Refresh' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible();
    // FR-9a: the menu holds the trailing edge, so the utility sits before it, never after.
    expect(
      precedes(
        screen.getByRole('button', { name: 'Refresh' }),
        screen.getByRole('button', { name: 'Actions' }),
      ),
    ).toBe(true);
  });

  it('renders the utility first in the row, before a Back control and before the sole verb', () => {
    renderFrame([addMember(), refresh()], backToSeries());

    // FR-9a / AC-50: the utility leads the run, so it is never between two buttons - the row
    // reads Refresh, Back, then the verb, which holds the trailing edge.
    expect(rowOrder()).toEqual(['Refresh', 'Back to series', 'Add member']);
    expect(
      precedes(
        screen.getByRole('button', { name: 'Refresh' }),
        screen.getByRole('button', { name: 'Back to series' }),
      ),
    ).toBe(true);
    expect(
      precedes(
        screen.getByRole('button', { name: 'Back to series' }),
        screen.getByRole('button', { name: 'Add member' }),
      ),
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('renders the utility before a Back control and before the two-verb Actions menu', () => {
    renderFrame([importAttendance(), addMember(), refresh()], backToSeries());

    expect(rowOrder()).toEqual(['Refresh', 'Back to series', 'Actions']);
    expect(
      precedes(
        screen.getByRole('button', { name: 'Refresh' }),
        screen.getByRole('button', { name: 'Back to series' }),
      ),
    ).toBe(true);
    expect(
      precedes(
        screen.getByRole('button', { name: 'Back to series' }),
        screen.getByRole('button', { name: 'Actions' }),
      ),
    ).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps the utility ahead of a Back control on a page with no verb', () => {
    renderFrame([refresh()], backToSeries());

    expect(rowOrder()).toEqual(['Refresh', 'Back to series']);
    expect(
      precedes(
        screen.getByRole('button', { name: 'Refresh' }),
        screen.getByRole('button', { name: 'Back to series' }),
      ),
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('carries a disabled sole verb through to its visible button', () => {
    renderFrame([addMember(vi.fn(), true)]);

    expect(screen.getByRole('button', { name: 'Add member' })).toBeDisabled();
  });

  it('carries a disabled utility through to its icon button', () => {
    renderFrame([refresh(vi.fn(), true)]);

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });

  it('carries a disabled verb into its menu item', async () => {
    const user = userEvent.setup();
    renderFrame([{ ...addMember(vi.fn(), true) }, importAttendance()]);

    await user.click(screen.getByRole('button', { name: 'Actions' }));

    const item = await screen.findByRole('menuitem', { name: 'Add member' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });
});
