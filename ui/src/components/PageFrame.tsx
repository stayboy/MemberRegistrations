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
import { PageActions, isVerb, type PageAction } from './PageActions';

const useStyles = makeStyles({
  frame: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    width: '100%',
    maxWidth: '1440px',
    marginInline: 'auto',
  },
  // FR-9a: the breadcrumb row spans the content width, so the action row sits at its right
  // edge and never covers the page's title.
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
    flexWrap: 'wrap',
    width: '100%',
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
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  // A page with no menu (a form's commit/cancel pair, for example) keeps its controls at
  // the row's right edge, where the header actions used to sit.
  controlsTrailing: {
    marginInlineStart: 'auto',
  },
  // FR-9a: the `Refresh`-class utilities lead the button run - before `Back`, before the verb,
  // before the menu - so an icon never sits between two buttons. The group carries the row's
  // trailing offset, so the whole run stays at the right edge and the icon still keeps the row
  // gap from the control it precedes; where the row wraps, the run wraps below the breadcrumb
  // and stays right-aligned.
  utilities: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    marginInlineStart: 'auto',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  // With no utility to lead the run, the verb or menu holds the trailing edge itself.
  actionsTrailing: {
    marginInlineStart: 'auto',
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
  controls,
  hideBadge = false,
  children,
}: {
  sectionId: SectionId;
  title: string;
  submenu?: string;
  description?: string;
  /** The page's action row: verbs and `Refresh`-class utilities (FR-9a). */
  actions?: readonly PageAction[];
  /**
   * Header controls that stay visible outside the action row: filters, date windows and view
   * switches, plus a form's commit/cancel pair and a `Back` navigation control. They are
   * laid out on the breadcrumb row, after the utilities and left of the verb or menu (FR-9a).
   */
  controls?: ReactNode;
  /** The landing drops the API-connected pill; the operator pages keep it. */
  hideBadge?: boolean;
  children?: ReactNode;
}) {
  const styles = useStyles();
  const section = SECTIONS.find((candidate) => candidate.id === sectionId) ?? SECTIONS[0];
  const health = useGatewayHealth();
  const { pathname } = useLocation();
  const showUssdNotice = showsUssdProductionNotice(sectionId, pathname);
  // FR-9a: verbs take part in the one-or-many rule; utilities never do.
  const verbs = (actions ?? []).filter(isVerb);
  const utilities = (actions ?? []).filter((action) => action.kind === 'utility');
  const [soleVerb] = verbs;
  const hasUtilities = utilities.length > 0;
  const hasActions = verbs.length > 0 || hasUtilities;

  return (
    <div className={styles.frame}>
      <div className={styles.actionRow}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link to={firstItemOf(section).path} className={styles.breadcrumbLink}>
            {section.label}
          </Link>
          <span aria-hidden="true">/</span>
          <span className={styles.breadcrumbCurrent} aria-current="page">
            {submenu ?? title}
          </span>
        </nav>
        {/* FR-9a: the utilities group first in the row, named for assistive tech; the verb or
            menu holds the trailing edge. An icon therefore leads the run of controls and never
            interrupts it (owner, 2026-11-15). */}
        {hasUtilities ? (
          <div className={styles.utilities}>
            {utilities.map((utility) => (
              <Button
                key={utility.id}
                appearance="subtle"
                aria-label={utility.label}
                icon={utility.icon}
                disabled={utility.disabled}
                onClick={utility.onSelect}
              />
            ))}
          </div>
        ) : null}
        {controls ? (
          <div
            className={
              hasActions ? styles.controls : `${styles.controls} ${styles.controlsTrailing}`
            }
          >
            {controls}
          </div>
        ) : null}
        {verbs.length > 0 ? (
          <div
            className={
              hasUtilities ? styles.actions : `${styles.actions} ${styles.actionsTrailing}`
            }
          >
            {/* FR-9a: exactly one verb renders visibly; two or more group into the menu. */}
            {verbs.length === 1 && soleVerb ? (
              <Button
                icon={soleVerb.icon}
                disabled={soleVerb.disabled}
                onClick={soleVerb.onSelect}
              >
                {soleVerb.label}
              </Button>
            ) : null}
            {verbs.length >= 2 ? <PageActions actions={verbs} /> : null}
          </div>
        ) : null}
      </div>

      <div className={styles.headingBlock}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          {hideBadge ? null : <ConnectionBadge />}
        </div>
        {description ? <p className={styles.description}>{description}</p> : null}
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
