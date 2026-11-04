import { Button, makeStyles, shorthands, tokens } from '@fluentui/react-components';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageFrame } from '../components/PageFrame';
import { sectionForPath } from '../shell/navigation';

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  text: {
    margin: 0,
    color: tokens.colorNeutralForeground2,
    maxWidth: '64ch',
  },
});

export function NotFoundPage() {
  const styles = useStyles();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <PageFrame
      sectionId={sectionForPath(pathname).id}
      title="Page not found"
      submenu="Not found"
      description="The address does not match a surface in this workspace."
    >
      <div className={styles.body}>
        <p className={styles.text}>
          Nothing is routed at <code>{pathname}</code>. Use the menus, or return to the Members
          landing page.
        </p>
        <Button appearance="primary" onClick={() => navigate('/members')}>
          Go to Members
        </Button>
      </div>
    </PageFrame>
  );
}
