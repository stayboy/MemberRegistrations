import {
  Button,
  Dropdown,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Switch,
  Tooltip,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  CheckmarkRegular,
  ColorRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular,
} from '@fluentui/react-icons';
import { ACCENTS, isAccentId } from '../theme/brand';
import { useThemePreference } from '../theme/ThemeProvider';

const useStyles = makeStyles({
  appearance: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
  },
  overline: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  dropdown: {
    minWidth: '120px',
    flexGrow: 1,
  },
  collapsed: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalS,
    paddingBlock: tokens.spacingVerticalM,
  },
  collapsedButton: {
    width: '34px',
    height: '34px',
    minWidth: '34px',
  },
});

export function AppearanceFields() {
  const styles = useStyles();
  const { accent, scheme, setAccent, toggleScheme } = useThemePreference();
  const accentLabel = ACCENTS.find((option) => option.id === accent)?.label ?? 'Fluent';

  return (
    <>
      <span className={styles.overline}>Appearance</span>
      <div className={styles.row}>
        <Dropdown
          aria-label="Accent theme"
          className={styles.dropdown}
          size="small"
          value={accentLabel}
          selectedOptions={[accent]}
          onOptionSelect={(_, data) => {
            if (isAccentId(data.optionValue)) setAccent(data.optionValue);
          }}
        >
          {ACCENTS.map((option) => (
            <Option key={option.id} value={option.id} text={option.label}>
              {option.label}
            </Option>
          ))}
        </Dropdown>
        <Switch
          aria-label="Dark mode"
          checked={scheme === 'dark'}
          onChange={() => toggleScheme()}
          label="Dark"
        />
      </div>
    </>
  );
}

export function ThemeControl({ collapsed }: { collapsed: boolean }) {
  const styles = useStyles();
  const { accent, scheme, setAccent, toggleScheme } = useThemePreference();
  const accentLabel = ACCENTS.find((option) => option.id === accent)?.label ?? 'Fluent';
  const schemeAction = scheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  if (!collapsed) {
    return (
      <div className={styles.appearance}>
        <AppearanceFields />
      </div>
    );
  }

  return (
    <div className={styles.collapsed}>
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <Tooltip content={`Accent theme: ${accentLabel}`} relationship="description" withArrow>
            <Button
              appearance="subtle"
              className={styles.collapsedButton}
              icon={<ColorRegular />}
              aria-label={`Accent theme: ${accentLabel}`}
            />
          </Tooltip>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {ACCENTS.map((option) => (
              <MenuItem
                key={option.id}
                role="menuitemradio"
                aria-checked={option.id === accent}
                icon={option.id === accent ? <CheckmarkRegular /> : undefined}
                onClick={() => setAccent(option.id)}
              >
                {option.label}
              </MenuItem>
            ))}
          </MenuList>
        </MenuPopover>
      </Menu>

      <Tooltip content={schemeAction} relationship="description" withArrow>
        <Button
          appearance="subtle"
          className={styles.collapsedButton}
          icon={scheme === 'dark' ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
          aria-label={schemeAction}
          onClick={toggleScheme}
        />
      </Tooltip>
    </div>
  );
}
