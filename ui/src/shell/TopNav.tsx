import {
  Button,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { NavigationRegular } from '@fluentui/react-icons';
import { Link, useNavigate } from 'react-router-dom';
import { SECTIONS, firstItemOf, type NavSection, type SectionId } from './navigation';

const useStyles = makeStyles({
  nav: {
    display: 'flex',
    alignItems: 'stretch',
    gap: tokens.spacingHorizontalXS,
    marginLeft: 'auto',
    paddingInline: tokens.spacingHorizontalS,
    overflowX: 'auto',
  },
  link: {
    display: 'inline-flex',
    alignItems: 'center',
    paddingInline: tokens.spacingHorizontalS,
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    ':hover': {
      color: tokens.colorNeutralForeground1,
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '-2px',
    },
  },
  linkActive: {
    color: tokens.colorBrandForeground1,
    borderBottomColor: tokens.colorBrandStroke1,
    fontWeight: tokens.fontWeightSemibold,
  },
  mobile: {
    display: 'flex',
    alignItems: 'center',
    marginLeft: 'auto',
    paddingInline: tokens.spacingHorizontalS,
  },
});

export function TopNav({
  activeSection,
  isNarrow,
}: {
  activeSection: NavSection;
  isNarrow: boolean;
}) {
  const styles = useStyles();
  const navigate = useNavigate();

  if (isNarrow) {
    return (
      <div className={styles.mobile}>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button appearance="subtle" icon={<NavigationRegular />} aria-label="Sections">
              Sections
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {SECTIONS.map((section) => (
                <MenuItem
                  key={section.id}
                  icon={<section.icon />}
                  onClick={() => {
                    navigate(firstItemOf(section).path);
                  }}
                >
                  {section.label}
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    );
  }

  return (
    <nav className={styles.nav} aria-label="Sections">
      {SECTIONS.map((section) => (
        <TopNavLink
          key={section.id}
          sectionId={section.id}
          label={section.label}
          path={firstItemOf(section).path}
          active={section.id === activeSection.id}
        />
      ))}
    </nav>
  );
}

function TopNavLink({
  sectionId,
  label,
  path,
  active,
}: {
  sectionId: SectionId;
  label: string;
  path: string;
  active: boolean;
}) {
  const styles = useStyles();
  return (
    <Link
      to={path}
      aria-current={active ? 'page' : undefined}
      data-section={sectionId}
      className={`${styles.link} ${active ? styles.linkActive : ''}`}
    >
      {label}
    </Link>
  );
}
