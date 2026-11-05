import {
  Button,
  Radio,
  RadioGroup,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Text,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { SignOutRegular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../auth/SessionProvider';
import { PageFrame } from '../components/PageFrame';
import {
  DATE_STYLE_OPTIONS,
  TIME_CYCLE_OPTIONS,
  isDateStyle,
  isTimeCycle,
} from '../format/datetime';
import { useDateTimeFormat, useDateTimePreference } from '../shell/DateTimeProvider';
import { AppearanceFields } from '../shell/ThemeControl';

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  panelTitle: {
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  muted: {
    margin: 0,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  appearance: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  controlGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  previewRow: {
    verticalAlign: 'top',
  },
  previewNote: {
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
});

export function SettingsPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { officer, signOut } = useSession();
  const { preference, setDateStyle, setTimeCycle } = useDateTimePreference();
  const { formatDate, formatInstant, formatTime, formatInstantTitle } = useDateTimeFormat();

  const previewInstant = '2026-11-04T23:30:00Z';
  const previewCalendarDate = '1990-05-14';
  const previewWallClock = '09:00';

  return (
    <PageFrame
      sectionId="admin"
      title="Settings"
      submenu="Settings"
      description="Appearance, dates and the session for this tab. Preferences stay in this browser; no register data is stored."
    >
      <div className={styles.grid}>
        <section className={styles.panel} aria-labelledby="settings-appearance">
          <h2 id="settings-appearance" className={styles.panelTitle}>
            Appearance
          </h2>
          <div className={styles.appearance}>
            <AppearanceFields />
          </div>
          <p className={styles.muted}>
            The accent and light/dark choice are restored before first paint and remembered in this
            browser. The sidebar collapse state is remembered the same way.
          </p>
        </section>

        <section className={styles.panel} aria-labelledby="settings-datetime">
          <h2 id="settings-datetime" className={styles.panelTitle}>
            Date and time
          </h2>
          <p className={styles.muted}>
            How dates and times are written. Instants convert to this browser&apos;s zone; calendar
            dates and session times keep the day and time the register recorded.
          </p>
          <div className={styles.appearance}>
            <div className={styles.controlGroup}>
              <Text weight="semibold">Date format</Text>
              <RadioGroup
                aria-label="Date format"
                value={preference.dateStyle}
                onChange={(_, data) => {
                  if (isDateStyle(data.value)) setDateStyle(data.value);
                }}
              >
                {DATE_STYLE_OPTIONS.map((option) => (
                  <Radio key={option.value} value={option.value} label={option.label} />
                ))}
              </RadioGroup>
            </div>
            <div className={styles.controlGroup}>
              <Text weight="semibold">Time format</Text>
              <RadioGroup
                aria-label="Time format"
                value={preference.timeCycle}
                onChange={(_, data) => {
                  if (isTimeCycle(data.value)) setTimeCycle(data.value);
                }}
              >
                {TIME_CYCLE_OPTIONS.map((option) => (
                  <Radio key={option.value} value={option.value} label={option.label} />
                ))}
              </RadioGroup>
            </div>
          </div>
          <Text weight="semibold">Preview</Text>
          <Table size="small" aria-label="Date and time preview">
            <TableBody>
              <TableRow className={styles.previewRow}>
                <TableCell>Record created</TableCell>
                <TableCell>
                  <span title={formatInstantTitle(previewInstant)}>
                    {formatInstant(previewInstant)}
                  </span>
                </TableCell>
                <TableCell className={styles.previewNote}>Instant · converted</TableCell>
              </TableRow>
              <TableRow className={styles.previewRow}>
                <TableCell>Birth date</TableCell>
                <TableCell>{formatDate(previewCalendarDate)}</TableCell>
                <TableCell className={styles.previewNote}>Date · not shifted</TableCell>
              </TableRow>
              <TableRow className={styles.previewRow}>
                <TableCell>Session start</TableCell>
                <TableCell>{formatTime(previewWallClock)}</TableCell>
                <TableCell className={styles.previewNote}>Wall clock · as scheduled</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>

        <section className={styles.panel} aria-labelledby="settings-session">
          <h2 id="settings-session" className={styles.panelTitle}>
            Session
          </h2>
          <p className={styles.muted}>
            {officer
              ? `Signed in as ${officer.name} (${officer.email}).`
              : 'This tab holds a short-lived session.'}{' '}
            Signing out revokes it with the gateway and clears cached data.
          </p>
          <div className={styles.actions}>
            <Button
              icon={<SignOutRegular />}
              onClick={() => {
                void signOut().then(() => navigate('/connect', { replace: true }));
              }}
            >
              Sign out
            </Button>
            <Button appearance="primary" onClick={() => navigate('/connect')}>
              API connection
            </Button>
          </div>
          <p className={styles.muted}>
            Every authenticated officer has full read and write access to the register in V2.
          </p>
        </section>
      </div>
    </PageFrame>
  );
}
