import { Button, makeStyles, shorthands, tokens } from '@fluentui/react-components';
import { SignOutRegular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../auth/SessionProvider';
import { PageFrame } from '../components/PageFrame';
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

  return (
    <PageFrame
      sectionId="admin"
      title="Settings"
      submenu="Settings"
      description="Appearance, navigation and the session for this tab. Preferences stay in this browser; no register data is stored."
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
