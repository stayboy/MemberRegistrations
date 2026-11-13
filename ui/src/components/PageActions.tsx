import {
  Button,
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
} from '@fluentui/react-components';
import { ChevronDownRegular } from '@fluentui/react-icons';
import type { ReactElement, ReactNode } from 'react';

export interface PageAction {
  id: string;
  label: string;
  icon?: ReactElement;
  onSelect: () => void;
  disabled?: boolean;
  /**
   * A member of the trailing destructive group: the item is rendered after the divider that
   * opens that group, and before any trailing `Refresh`.
   */
  destructive?: boolean;
}

/**
 * FR-9a's separator opens the trailing group: the destructive verbs, with `Refresh` last.
 * The group starts at the first destructive verb. A page with none (a create verb plus
 * `Refresh`) starts it at its final item, and a single-item menu has no divider at all.
 * Returns the index the divider is drawn before, or `-1` for none.
 */
function dividerIndex(actions: readonly PageAction[]): number {
  const firstDestructive = actions.findIndex((action) => action.destructive);
  if (firstDestructive >= 0) return firstDestructive === 0 ? -1 : firstDestructive;
  return actions.length > 1 ? actions.length - 1 : -1;
}

/**
 * One page's **action row** verbs, as the single `Actions` menu at the right edge of the
 * breadcrumb row (UI spec D12, FR-9a).
 *
 * The repo rule is `AGENTS.md` §16: Fluent's component comes before a rewrite. So the menu
 * is composed from Fluent's own primitives — `Menu`, `MenuTrigger`, `MenuPopover`,
 * `MenuList`, `MenuItem` and `MenuDivider` — and nothing here hand-builds a popover, focus
 * handling or keyboard navigation. `MenuTrigger` wrapping a Fluent `Button` supplies
 * `aria-haspopup` and `aria-expanded`; the trigger's visible text is the menu's accessible
 * name, because a bare kebab is not legible enough to find (owner, 2026-11-13).
 *
 * The shape follows the four in-tree precedents: `shell/AccountMenu`, `shell/TopNav`,
 * `shell/ThemeControl` and `components/DateTimeMenu`.
 */
export function PageActions({ actions }: { actions: readonly PageAction[] }) {
  // FR-9a: a page with no verb action renders no menu and leaves the slot empty.
  if (actions.length === 0) return null;

  const dividerAt = dividerIndex(actions);

  const items: ReactNode[] = [];
  actions.forEach((action, index) => {
    if (index === dividerAt) items.push(<MenuDivider key={`${action.id}-divider`} />);
    items.push(
      <MenuItem
        key={action.id}
        icon={action.icon}
        disabled={action.disabled}
        onClick={action.onSelect}
      >
        {action.label}
      </MenuItem>,
    );
  });

  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button icon={<ChevronDownRegular aria-hidden="true" />} iconPosition="after">
          Actions
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>{items}</MenuList>
      </MenuPopover>
    </Menu>
  );
}
