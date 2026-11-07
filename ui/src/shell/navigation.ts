import {
  ArchiveRegular,
  ArrowUploadRegular,
  BookContactsRegular,
  CalendarLtrRegular,
  CalendarMonthRegular,
  ClockRegular,
  DocumentRegular,
  DocumentTableRegular,
  DocumentTextRegular,
  GridRegular,
  HeartRegular,
  HistoryRegular,
  KeyRegular,
  PeopleAddRegular,
  PeopleRegular,
  PeopleTeamRegular,
  PersonAddRegular,
  PersonCallRegular,
  PhoneDesktopRegular,
  PhoneRegular,
  PlugConnectedRegular,
  SettingsRegular,
  type FluentIcon,
} from '@fluentui/react-icons';

export type SectionId = 'members' | 'events' | 'imports' | 'shepherding' | 'ussd' | 'admin';

export interface NavItem {
  readonly label: string;
  readonly path: string;
  readonly icon: FluentIcon;
  readonly description: string;
}

export interface NavSection {
  readonly id: SectionId;
  readonly label: string;
  readonly icon: FluentIcon;
  readonly items: readonly NavItem[];
}

export const SECTIONS: readonly NavSection[] = [
  {
    id: 'members',
    label: 'Members',
    icon: PeopleRegular,
    items: [
      {
        label: 'All members',
        path: '/members',
        icon: PeopleRegular,
        description: 'Look up a registration, attendance, ministries and coverage.',
      },
      {
        label: 'Add member',
        path: '/members/new',
        icon: PeopleAddRegular,
        description: 'Create a new member registration.',
      },
      {
        label: 'Archived',
        path: '/members/archived',
        icon: ArchiveRegular,
        description: 'Review archived registrations and restore them.',
      },
    ],
  },
  {
    id: 'events',
    label: 'Events',
    icon: CalendarLtrRegular,
    items: [
      {
        label: 'Events',
        path: '/events',
        icon: CalendarLtrRegular,
        description: 'Events and their meeting dates.',
      },
      {
        label: 'Series',
        path: '/events/series',
        icon: CalendarMonthRegular,
        description: 'Series, schedule versions and exceptions.',
      },
    ],
  },
  {
    id: 'imports',
    label: 'Imports',
    icon: DocumentTableRegular,
    items: [
      {
        label: 'Member database',
        path: '/imports/members',
        icon: DocumentTableRegular,
        description: 'Import the member database from a CSV or the Excel template.',
      },
      {
        label: 'Attendance registry',
        path: '/imports/attendance',
        icon: ArrowUploadRegular,
        description: 'Import attendance for an event session chosen on this screen.',
      },
      {
        label: 'Batch lookup',
        path: '/imports/batches',
        icon: HistoryRegular,
        description: 'Look up an import batch from this tab.',
      },
    ],
  },
  {
    id: 'shepherding',
    label: 'Shepherding',
    icon: PeopleTeamRegular,
    items: [
      {
        label: 'Officers',
        path: '/shepherding/officers',
        icon: PeopleTeamRegular,
        description: 'Church coverage and the per-officer roster summary.',
      },
      {
        label: 'Roster',
        path: '/shepherding/roster',
        icon: PersonCallRegular,
        description: 'An officer roster, follow-up filters and call logging.',
      },
      {
        label: 'Church report',
        path: '/shepherding/report',
        icon: DocumentRegular,
        description: 'Church totals and the still-in-church distribution.',
      },
    ],
  },
  {
    id: 'ussd',
    label: 'USSD',
    icon: PhoneRegular,
    items: [
      {
        label: 'Codes',
        path: '/ussd/codes',
        icon: KeyRegular,
        description: 'Issue, review and void handset attendance and registration codes.',
      },
      {
        label: 'Registrations',
        path: '/ussd/registrations',
        icon: PersonAddRegular,
        description: 'Approve or reject pending USSD registration requests.',
      },
      {
        label: 'Clocking',
        path: '/ussd/clocking',
        icon: ClockRegular,
        description: 'Session attendance, clock-ins and presbyter delegations.',
      },
      {
        label: 'Headcount',
        path: '/ussd/headcount',
        icon: PeopleRegular,
        description: 'Record and correct the counted attendance for a session.',
      },
      {
        label: 'Activities',
        path: '/ussd/activities',
        icon: CalendarLtrRegular,
        description: 'The handset activity list with the same eligibility and ordering.',
      },
      {
        label: 'Products',
        path: '/ussd/products',
        icon: HeartRegular,
        description: 'Welfare products, eligibility, payer, period, cover and dependents.',
      },
      {
        label: 'Claims',
        path: '/ussd/claims',
        icon: DocumentTextRegular,
        description: 'Record welfare claims and move them through their statuses.',
      },
      {
        label: 'Simulator',
        path: '/ussd/simulator',
        icon: PhoneDesktopRegular,
        description: 'Development-only handset simulator over the real provider adapters.',
      },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: GridRegular,
    items: [
      {
        label: 'Ministries',
        path: '/admin/ministries',
        icon: GridRegular,
        description: 'Maintain the ministry list used by member records.',
      },
      {
        label: 'API connection',
        path: '/connect',
        icon: PlugConnectedRegular,
        description: 'Check the gateway connection and sign in.',
      },
      {
        label: 'Settings',
        path: '/settings',
        icon: SettingsRegular,
        description: 'Appearance, navigation and sign out.',
      },
    ],
  },
];

export const BRAND_ICON = BookContactsRegular;

function itemMatchesPath(item: NavItem, pathname: string): boolean {
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

export function sectionForPath(pathname: string): NavSection {
  for (const section of SECTIONS) {
    if (section.items.some((item) => itemMatchesPath(item, pathname))) return section;
  }

  const firstSegment = `/${pathname.split('/')[1] ?? ''}`;
  return (
    SECTIONS.find((section) => section.items.some((item) => item.path.startsWith(firstSegment))) ??
    SECTIONS[0]
  );
}

export function navItemForPath(pathname: string): NavItem {
  const section = sectionForPath(pathname);
  const exact = section.items.find((item) => item.path === pathname);
  if (exact) return exact;

  const prefixed = section.items
    .filter((item) => pathname.startsWith(`${item.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0];

  return prefixed ?? section.items[0];
}

export function firstItemOf(section: NavSection): NavItem {
  return section.items[0];
}
