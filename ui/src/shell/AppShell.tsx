import { Link, Outlet, useLocation } from 'react-router-dom';
import { makeStyles, tokens } from '@fluentui/react-components';
import { useEffect, useRef, useState } from 'react';
import { AccountMenu } from './AccountMenu';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { BRAND_ICON, navItemForPath, sectionForPath } from './navigation';
import { persistSidebarState, readSidebarState, type SidebarState } from './nav-state';
import { useMediaQuery } from './useMediaQuery';

const useStyles = makeStyles({
  shell: {
    display: 'grid',
    gridTemplateRows: '56px minmax(0, 1fr)',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  header: {
    display: 'flex',
    alignItems: 'stretch',
    minWidth: 0,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
    backgroundColor: tokens.colorNeutralBackground1,
    zIndex: 2,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
    paddingInline: tokens.spacingHorizontalM,
    borderRightWidth: '1px',
    borderRightStyle: 'solid',
    borderRightColor: tokens.colorNeutralStroke2,
    color: tokens.colorNeutralForeground1,
    textDecoration: 'none',
    transitionProperty: 'width',
    transitionDuration: '160ms',
    transitionTimingFunction: 'ease',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '-2px',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0ms',
    },
  },
  brandIcon: {
    fontSize: '26px',
    color: tokens.colorBrandForeground1,
    flexShrink: 0,
  },
  brandText: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1.1,
    minWidth: 0,
    overflow: 'hidden',
  },
  brandTitle: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
  },
  brandSubtitle: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  body: {
    display: 'flex',
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  content: {
    flexGrow: 1,
    minWidth: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: tokens.spacingHorizontalXXL,
    outlineStyle: 'none',
    '@media (max-width: 860px)': {
      padding: tokens.spacingHorizontalM,
    },
  },
});

export function AppShell() {
  const styles = useStyles();
  const location = useLocation();
  const isNarrow = useMediaQuery('(max-width: 860px)');
  const [sidebarState, setSidebarState] = useState<SidebarState>(() => readSidebarState());
  const collapsed = isNarrow || sidebarState === 'collapsed';
  const section = sectionForPath(location.pathname);
  const currentItem = navItemForPath(location.pathname);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = `${currentItem.label} · Church Register`;
  }, [currentItem.label]);

  // Route changes move focus into the content slot, so a keyboard user does not
  // have to tab through the shell again (NFR-1).
  useEffect(() => {
    mainRef.current?.focus();
  }, [location.pathname]);

  const toggleSidebar = () => {
    const next: SidebarState = sidebarState === 'collapsed' ? 'expanded' : 'collapsed';
    setSidebarState(next);
    persistSidebarState(next);
  };

  return (
    <div className={styles.shell}>
      <a
        className="mr-skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>

      <header className={styles.header}>
        <Link
          to="/members"
          className={styles.brand}
          aria-label="Church Register, go to Members"
          style={{ width: isNarrow ? 'auto' : collapsed ? '56px' : '260px' }}
        >
          <BRAND_ICON className={styles.brandIcon} aria-hidden="true" />
          {collapsed && !isNarrow ? null : (
            <span className={styles.brandText}>
              <span className={styles.brandTitle}>Church Register</span>
              <span className={styles.brandSubtitle}>Member Registrations</span>
            </span>
          )}
        </Link>

        <TopNav activeSection={section} isNarrow={isNarrow} />
        <AccountMenu isNarrow={isNarrow} />
      </header>

      <div className={styles.body}>
        <Sidebar
          section={section}
          collapsed={collapsed}
          showToggle={!isNarrow}
          onToggle={toggleSidebar}
        />
        <main id="main-content" ref={mainRef} tabIndex={-1} className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
