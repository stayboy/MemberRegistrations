import {
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ConnectionBadge, connectionErrorDetail, useGatewayHealth } from '../shell/ConnectionBadge';
import { SECTIONS, firstItemOf, type SectionId } from '../shell/navigation';

const useStyles = makeStyles({
  frame: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    width: '100%',
    maxWidth: '1440px',
    marginInline: 'auto',
  },
  topRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
  },
  headingBlock: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
  },
  breadcrumbLink: {
    color: tokens.colorNeutralForeground2,
    textDecoration: 'none',
    ':hover': { color: tokens.colorBrandForeground1, textDecoration: 'underline' },
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
  breadcrumbCurrent: {
    color: tokens.colorNeutralForeground3,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
    fontSize: tokens.fontSizeHero700,
    lineHeight: tokens.lineHeightHero700,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  description: {
    margin: 0,
    maxWidth: '72ch',
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  body: {
    minWidth: 0,
  },
});

/**
 * The production notice belongs to every USSD operator page. The Simulator is
 * development-only and keeps its own MessageBar, so it is excluded here.
 */
export function showsUssdProductionNotice(
  sectionId: SectionId,
  pathname: string,
  production = import.meta.env.PROD,
): boolean {
  return production && sectionId === 'ussd' && pathname !== '/ussd/simulator';
}

export function PageFrame({
  sectionId,
  title,
  submenu,
  description,
  actions,
  hideBadge = false,
  children,
}: {
  sectionId: SectionId;
  title: string;
  submenu?: string;
  description?: string;
  actions?: ReactNode;
  /** The landing drops the API-connected pill; the operator pages keep it. */
  hideBadge?: boolean;
  children?: ReactNode;
}) {
  const styles = useStyles();
  const section = SECTIONS.find((candidate) => candidate.id === sectionId) ?? SECTIONS[0];
  const health = useGatewayHealth();
  const { pathname } = useLocation();
  const showUssdNotice = showsUssdProductionNotice(sectionId, pathname);

  return (
    <div className={styles.frame}>
      <div className={styles.topRow}>
        <div className={styles.headingBlock}>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <Link to={firstItemOf(section).path} className={styles.breadcrumbLink}>
              {section.label}
            </Link>
            <span aria-hidden="true">/</span>
            <span className={styles.breadcrumbCurrent} aria-current="page">
              {submenu ?? title}
            </span>
          </nav>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            {hideBadge ? null : <ConnectionBadge />}
          </div>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>

      {health.isError ? (
        <MessageBar intent="warning">
          <MessageBarBody>
            Can&apos;t reach the API. {connectionErrorDetail(health.error)} The shell still works —{' '}
            <Link to="/connect">check the API connection</Link>.{' '}
            <Button
              size="small"
              appearance="transparent"
              onClick={() => {
                void health.refetch();
              }}
            >
              Retry
            </Button>
          </MessageBarBody>
        </MessageBar>
      ) : null}

      {showUssdNotice ? (
        <MessageBar intent="info">
          <MessageBarBody>
            <MessageBarTitle>USSD is not live in this production build.</MessageBarTitle>
            The member dial-in is disabled until an aggregator and payment provider are chosen; the
            operator pages remain available.
          </MessageBarBody>
        </MessageBar>
      ) : null}

      <div className={styles.body}>{children}</div>
    </div>
  );
}
