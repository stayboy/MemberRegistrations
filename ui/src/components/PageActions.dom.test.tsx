import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PageActions, type PageAction } from './PageActions';

/**
 * FR-9a: one `Actions` menu holds a page's two-or-more verbs. These cases pin the contract
 * the call sites rely on — the empty slot, the label that names the menu, the closed state
 * as well as the open one, the disabled state an item inherits from its query, the
 * separator before the trailing destructive group, the order create-side → edit-side →
 * destructive, the absence of a divider when there is no destructive verb, that a
 * `Refresh`-class utility is never an item, and selection.
 */
function verb(onSelect = vi.fn(), label = 'Edit'): PageAction {
  return { id: label.toLowerCase(), kind: 'verb', label, onSelect, disabled: false };
}

function refresh(onSelect = vi.fn()): PageAction {
  return { id: 'refresh', kind: 'utility', label: 'Refresh', onSelect, disabled: false };
}

/** Fluent's own `MenuDivider`; it renders with `role="presentation"`, so select it by its class. */
function dividers(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.fui-MenuDivider')];
}

function divider(): HTMLElement {
  const [element] = dividers();
  if (!element) throw new Error('no Fluent MenuDivider was rendered');
  return element;
}

describe('PageActions', () => {
  it('renders no trigger for a page with no verb action', () => {
    render(<PageActions actions={[]} />);

    expect(screen.queryByRole('button', { name: /Actions/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders no trigger when the list holds only utilities', () => {
    render(<PageActions actions={[refresh()]} />);

    expect(screen.queryByRole('button', { name: /Actions/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('names the trigger Actions and opens a menu', async () => {
    const user = userEvent.setup();
    render(<PageActions actions={[verb()]} />);

    const trigger = screen.getByRole('button', { name: 'Actions' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    // FR-9a pins the open state to `aria-expanded`, supplied by Fluent's trigger rather than
    // hand-wired. Fluent 9.25.8's `useMenuTrigger` sets `'aria-expanded': !open ? undefined : open`,
    // so the closed state is the attribute's absence — `aria-expanded="false"` is not something the
    // library emits, and adding it here would fork the trigger's state. Pin the exact closed
    // contract (`not.toHaveAttribute`) rather than the old `not.toHaveAttribute(…, 'true')`, which
    // also passed for a `"false"` or any other stray value and so disclosed nothing.
    expect(trigger).not.toHaveAttribute('aria-expanded');

    await user.click(trigger);

    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
  });

  it('keeps a disabled action visible and does not fire it', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PageActions actions={[{ ...verb(onSelect), disabled: true }]} />);

    await user.click(screen.getByRole('button', { name: 'Actions' }));

    const item = screen.getByRole('menuitem', { name: 'Edit' });
    expect(item).toHaveAttribute('aria-disabled', 'true');

    await user.click(item);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('puts the destructive verbs after a separator, as the trailing group', async () => {
    const user = userEvent.setup();
    render(
      <PageActions
        actions={[
          { id: 'edit', kind: 'verb', label: 'Edit', onSelect: vi.fn() },
          { id: 'archive', kind: 'verb', label: 'Archive', onSelect: vi.fn(), destructive: true },
          { id: 'purge', kind: 'verb', label: 'Purge', onSelect: vi.fn(), destructive: true },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));

    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Edit', 'Archive', 'Purge']);
    expect(dividers()).toHaveLength(1);

    expect(divider().nextElementSibling).toBe(items[1]);
    expect(items[2]).toHaveTextContent('Purge');
  });

  it('draws no divider when no verb is destructive', async () => {
    const user = userEvent.setup();
    render(
      <PageActions
        actions={[
          { id: 'import-attendance', kind: 'verb', label: 'Import attendance', onSelect: vi.fn() },
          { id: 'edit', kind: 'verb', label: 'Edit', onSelect: vi.fn() },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));

    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Import attendance', 'Edit']);
    expect(dividers()).toHaveLength(0);
  });

  it('never renders a Refresh-class utility as a menu item', async () => {
    const user = userEvent.setup();
    render(
      <PageActions
        actions={[
          { id: 'import-attendance', kind: 'verb', label: 'Import attendance', onSelect: vi.fn() },
          refresh(),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));

    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Import attendance']);
    expect(screen.queryByRole('menuitem', { name: 'Refresh' })).not.toBeInTheDocument();
    expect(dividers()).toHaveLength(0);
  });

  it('calls the action it selected', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PageActions
        actions={[
          verb(onSelect),
          { id: 'archive', kind: 'verb', label: 'Archive', onSelect: vi.fn() },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders a primary verb as a visible button beside the menu, never as an item', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <PageActions
        actions={[
          { ...verb(onEdit), primary: true },
          { id: 'contacts', kind: 'verb', label: 'View contacts', onSelect: vi.fn() },
          { id: 'archive', kind: 'verb', label: 'Archive', onSelect: vi.fn(), destructive: true },
        ]}
      />,
    );

    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit).toBeVisible();
    await user.click(edit);
    expect(onEdit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['View contacts', 'Archive']);
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
    // The destructive group still starts after the divider.
    expect(divider().nextElementSibling).toBe(items[1]);
  });

  it('renders only the button when every verb is primary', () => {
    render(<PageActions actions={[{ ...verb(), primary: true }]} />);

    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
  });
});
