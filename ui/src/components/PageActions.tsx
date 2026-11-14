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
   * FR-9a classifies every action-row control, and the classification is explicit: a future
   * refresh-like control added without `kind` is a type error rather than a silent menu item.
   * A **verb** acts on the page or its collection — create, import, edit, archive/restore —
   * and lives in the `Actions` menu when the page has two or more, or renders visibly when it
   * has exactly one. A **`utility`** is a surface control that reads the page rather than
   * changing it (today `Refresh` and `Refresh columns`): it is never a menu item and never
   * counts towards the two-or-more rule.
   */
  kind: 'verb' | 'utility';
  /** A member of the trailing destructive group: the item is rendered after the separator. */
  destructive?: boolean;
}

/**
 * FR-9a's separator opens the trailing destructive group: create-side verbs, edit-side
 * verbs, separator, destructive verbs. The group starts at the first destructive verb; a
 * menu with no destructive verb draws no divider at all. Returns the index the divider is
 * drawn before, or `-1` for none.
 */
function dividerIndex(actions: readonly PageAction[]): number {
  const firstDestructive = actions.findIndex((action) => action.destructive);
  return firstDestructive >= 1 ? firstDestructive : -1;
}

/** FR-9a's one classification predicate: a verb owns the one-or-many rule, a utility never takes part. */
export const isVerb = (action: PageAction) => action.kind === 'verb';

/**
 * One page's **action-row** verbs, as the single `Actions` menu at the right edge of the
 * breadcrumb row (UI spec D12, FR-9a). The `PageFrame` passes verbs only: a `utility` such
 * as `Refresh` is a bare trailing icon, never an item, so it never reaches this menu.
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
  // FR-9a: a utility is never a menu item; filtering here keeps the contract even if a call
  // site passes the page's whole action list. `PageActions` is exported, so the guard stays
  // meaningful now that `kind` is required: the type does not separate verb from utility.
  const verbs = actions.filter(isVerb);

  // FR-9a: a page with no verb action renders no menu and leaves the slot empty.
  if (verbs.length === 0) return null;

  const dividerAt = dividerIndex(verbs);

  const items: ReactNode[] = [];
  verbs.forEach((action, index) => {
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
