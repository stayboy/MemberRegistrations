import { Button, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { PanelLeftContractRegular, PanelLeftExpandRegular } from '@fluentui/react-icons';
import { Link, useLocation } from 'react-router-dom';
import type { NavSection } from './navigation';
import { ThemeControl } from './ThemeControl';

const useStyles = makeStyles({
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    height: '100%',
    overflow: 'hidden',
    borderRightWidth: '1px',
    borderRightStyle: 'solid',
    borderRightColor: tokens.colorNeutralStroke2,
    backgroundColor: tokens.colorNeutralBackground1,
    transitionProperty: 'width',
    transitionDuration: '160ms',
    transitionTimingFunction: 'ease',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0ms',
    },
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalXS,
    minHeight: '56px',
    paddingInline: tokens.spacingHorizontalM,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  headerCollapsed: {
    justifyContent: 'center',
    paddingInline: 0,
  },
  sectionLabel: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1.15,
    overflow: 'hidden',
  },
  hidden: {
    display: 'none',
  },
  overline: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  sectionName: {
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  toggle: {
    flexShrink: 0,
  },
  nav: {
    flexGrow: 1,
    overflowY: 'auto',
    paddingBlock: tokens.spacingVerticalS,
  },
  list: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minHeight: '40px',
    paddingInline: tokens.spacingHorizontalM,
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
    textDecoration: 'none',
    ':hover': {
      color: tokens.colorNeutralForeground1,
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '-2px',
    },
  },
  itemCollapsed: {
    justifyContent: 'center',
    paddingInline: 0,
  },
  itemActive: {
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground2,
    borderLeftColor: tokens.colorBrandStroke1,
    fontWeight: tokens.fontWeightSemibold,
  },
  icon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  label: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  footer: {
    marginTop: 'auto',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
  },
});

function isItemActive(itemPath: string, pathname: string): boolean {
  if (pathname === itemPath) return true;
  if (itemPath === '/members') {
    return (
      pathname.startsWith('/members/') &&
      !pathname.startsWith('/members/new') &&
      !pathname.startsWith('/members/archived')
    );
  }
  return pathname.startsWith(`${itemPath}/`);
}

export function Sidebar({
  section,
  collapsed,
  showToggle,
  onToggle,
}: {
  section: NavSection;
  collapsed: boolean;
  showToggle: boolean;
  onToggle(): void;
}) {
  const styles = useStyles();
  const { pathname } = useLocation();

  return (
    <aside
      id="app-sidebar"
      className={styles.sidebar}
      style={{ width: collapsed ? '56px' : '260px' }}
      aria-label={`${section.label} navigation`}
    >
      <div className={`${styles.header} ${collapsed ? styles.headerCollapsed : ''}`}>
        <div className={`${styles.sectionLabel} ${collapsed ? styles.hidden : ''}`}>
          <span className={styles.overline}>Section</span>
          <span className={styles.sectionName}>{section.label}</span>
        </div>
        {showToggle ? (
          <Tooltip
            content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            relationship="description"
            withArrow
          >
            <Button
              appearance="subtle"
              className={styles.toggle}
              icon={collapsed ? <PanelLeftExpandRegular /> : <PanelLeftContractRegular />}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar"
              onClick={onToggle}
            />
          </Tooltip>
        ) : null}
      </div>

      <nav className={styles.nav} aria-label={`${section.label} submenu`}>
        <ul className={styles.list}>
          {section.items.map((item) => {
            const active = isItemActive(item.path, pathname);
            const Icon = item.icon;
            const link = (
              <Link
                to={item.path}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={`${styles.item} ${active ? styles.itemActive : ''} ${
                  collapsed ? styles.itemCollapsed : ''
                }`}
              >
                <Icon className={styles.icon} />
                <span className={`${styles.label} ${collapsed ? styles.hidden : ''}`}>
                  {item.label}
                </span>
              </Link>
            );

            return (
              <li key={item.path}>
                {collapsed ? (
                  <Tooltip content={item.label} relationship="description" withArrow>
                    {link}
                  </Tooltip>
                ) : (
                  link
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={styles.footer}>
        <ThemeControl collapsed={collapsed} />
      </div>
    </aside>
  );
}
