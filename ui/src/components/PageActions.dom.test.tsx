import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PageActions, type PageAction } from './PageActions';

/**
 * FR-9a: one `Actions` menu holds the page's action-row verbs. These cases pin the
 * contract the call sites rely on — the empty slot, the label that names the menu, the
 * closed state as well as the open one, the disabled state an item inherits from its
 * query, the separator before the trailing destructive group, FR-9a's item order with
 * `Refresh` last, and selection.
 */
function refresh(onSelect = vi.fn()): PageAction {
  return { id: 'refresh', label: 'Refresh', onSelect, disabled: false };
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

  it('names the trigger Actions and opens a menu', async () => {
    const user = userEvent.setup();
    render(<PageActions actions={[refresh()]} />);

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
    expect(screen.getByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('keeps a disabled action visible and does not fire it', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PageActions actions={[{ ...refresh(onSelect), disabled: true }]} />);

    await user.click(screen.getByRole('button', { name: 'Actions' }));

    const item = screen.getByRole('menuitem', { name: 'Refresh' });
    expect(item).toHaveAttribute('aria-disabled', 'true');

    await user.click(item);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('puts the destructive verbs after a separator, as the trailing group', async () => {
    const user = userEvent.setup();
    render(
      <PageActions
        actions={[
          { id: 'edit', label: 'Edit', onSelect: vi.fn() },
          { id: 'archive', label: 'Archive', onSelect: vi.fn(), destructive: true },
          { id: 'purge', label: 'Purge', onSelect: vi.fn(), destructive: true },
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

  it('keeps Refresh last, after the destructive group', async () => {
    const user = userEvent.setup();
    render(
      <PageActions
        actions={[
          { id: 'edit', label: 'Edit', onSelect: vi.fn() },
          { id: 'archive', label: 'Archive', onSelect: vi.fn(), destructive: true },
          refresh(),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));

    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Edit', 'Archive', 'Refresh']);
    expect(dividers()).toHaveLength(1);
    expect(divider().nextElementSibling).toBe(items[1]);
  });

  it('separates the trailing group on a page without a destructive verb', async () => {
    const user = userEvent.setup();
    render(
      <PageActions
        actions={[{ id: 'add-member', label: 'Add member', onSelect: vi.fn() }, refresh()]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));

    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Add member', 'Refresh']);
    expect(divider().nextElementSibling).toBe(items[1]);
  });

  it('calls the action it selected', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PageActions actions={[refresh(onSelect)]} />);

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Refresh' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
