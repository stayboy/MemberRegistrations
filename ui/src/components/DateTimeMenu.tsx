import {
  Button,
  Menu,
  MenuGroup,
  MenuGroupHeader,
  MenuItem,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Tooltip,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ChevronDownRegular, SettingsRegular } from '@fluentui/react-icons';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DATE_STYLE_LABELS,
  DATE_STYLE_OPTIONS,
  TIME_CYCLE_LABELS,
  TIME_CYCLE_OPTIONS,
  isDateStyle,
  isTimeCycle,
} from '../format/datetime';
import { useDateTimePreference } from '../shell/DateTimeProvider';

const useStyles = makeStyles({
  block: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalS}`,
  },
  overline: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  trigger: {
    width: '100%',
    justifyContent: 'flex-start',
    minWidth: 0,
  },
  triggerLabel: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },
  chevron: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
  },
  collapsed: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingBlock: tokens.spacingVerticalM,
  },
  collapsedButton: {
    width: '34px',
    height: '34px',
    minWidth: '34px',
  },
});

/**
 * The sidebar footer **Date and time** entry (UI spec FR-76 and the date/time
 * formatting spec, ticket 18c). One menu for the expanded row and the collapsed
 * icon button: click or right-click both open the full settings menu, and "Open
 * settings" routes to the panel. No inline dropdown lives in the sidebar.
 *
 * Call sites: `Sidebar` (both collapsed states). The option metadata lives in
 * `format/datetime` and is shared with the Settings page's radio list.
 */
export function DateTimeMenu({ collapsed }: { collapsed: boolean }) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { preference, setDateStyle, setTimeCycle } = useDateTimePreference();
  const [open, setOpen] = useState(false);

  const currentLabel = `${DATE_STYLE_LABELS[preference.dateStyle]} · ${
    TIME_CYCLE_LABELS[preference.timeCycle]
  }`;
  const menuLabel = `Date and time: ${currentLabel}`;

  const trigger = collapsed ? (
    <Tooltip content={menuLabel} relationship="description" withArrow>
      <Button
        appearance="subtle"
        className={styles.collapsedButton}
        icon={<SettingsRegular />}
        aria-label={menuLabel}
      />
    </Tooltip>
  ) : (
    <Button
      appearance="subtle"
      className={styles.trigger}
      icon={<SettingsRegular />}
      aria-label={menuLabel}
    >
      <span className={styles.triggerLabel}>{currentLabel}</span>
      <ChevronDownRegular className={styles.chevron} aria-hidden="true" />
    </Button>
  );

  return (
    <div className={collapsed ? styles.collapsed : styles.block}>
      {collapsed ? null : <span className={styles.overline}>Date and time</span>}
      <Menu
        open={open}
        onOpenChange={(_, data) => setOpen(data.open)}
        openOnContext
        checkedValues={{
          date: [preference.dateStyle],
          time: [preference.timeCycle],
        }}
        onCheckedValueChange={(_, data) => {
          const [value] = data.checkedItems;
          if (data.name === 'date' && isDateStyle(value)) setDateStyle(value);
          if (data.name === 'time' && isTimeCycle(value)) setTimeCycle(value);
        }}
      >
        <MenuTrigger disableButtonEnhancement>{trigger}</MenuTrigger>
        <MenuPopover>
          <MenuList>
            <MenuGroup>
              <MenuGroupHeader>Date format</MenuGroupHeader>
              {DATE_STYLE_OPTIONS.map((option) => (
                <MenuItemRadio key={option.value} name="date" value={option.value}>
                  {option.label}
                </MenuItemRadio>
              ))}
            </MenuGroup>
            <MenuGroup>
              <MenuGroupHeader>Time format</MenuGroupHeader>
              {TIME_CYCLE_OPTIONS.map((option) => (
                <MenuItemRadio key={option.value} name="time" value={option.value}>
                  {option.label}
                </MenuItemRadio>
              ))}
            </MenuGroup>
            <MenuItem
              onClick={() => {
                setOpen(false);
                navigate('/settings');
              }}
            >
              Open settings
            </MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>
    </div>
  );
}
