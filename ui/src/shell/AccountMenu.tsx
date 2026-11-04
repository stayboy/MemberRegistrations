import {
  Avatar,
  Button,
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { SettingsRegular, SignOutRegular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../auth/SessionProvider';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    paddingInline: tokens.spacingHorizontalM,
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorNeutralStroke2,
  },
  trigger: {
    maxWidth: '220px',
  },
  name: {
    marginLeft: tokens.spacingHorizontalXS,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    maxWidth: '280px',
  },
  headerName: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  headerEmail: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    overflowWrap: 'anywhere',
  },
  headerNote: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    marginTop: tokens.spacingVerticalXS,
  },
});

export function AccountMenu({ isNarrow }: { isNarrow: boolean }) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { status, officer, signOut } = useSession();

  if (status !== 'signed-in') {
    return (
      <div className={styles.container}>
        <Button appearance="primary" onClick={() => navigate('/connect')}>
          Sign in
        </Button>
      </div>
    );
  }

  const name = officer?.name ?? 'Signed-in officer';
  const email = officer?.email ?? '';

  return (
    <div className={styles.container}>
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <Button
            appearance="subtle"
            className={styles.trigger}
            aria-label={`Account menu for ${name}`}
          >
            <Avatar name={name} size={28} aria-hidden="true" />
            {isNarrow ? null : <span className={styles.name}>{name}</span>}
          </Button>
        </MenuTrigger>
        <MenuPopover>
          <div className={styles.header}>
            <span className={styles.headerName}>{name}</span>
            {email ? <span className={styles.headerEmail}>{email}</span> : null}
            <span className={styles.headerNote}>
              Every signed-in officer has full register access.
            </span>
          </div>
          <MenuDivider />
          <MenuList>
            <MenuItem icon={<SettingsRegular />} onClick={() => navigate('/settings')}>
              Settings
            </MenuItem>
            <MenuItem
              icon={<SignOutRegular />}
              onClick={() => {
                void signOut().then(() => navigate('/connect', { replace: true }));
              }}
            >
              Sign out
            </MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>
    </div>
  );
}
