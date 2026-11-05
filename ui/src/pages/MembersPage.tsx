import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  SearchBox,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Tooltip,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  AddRegular,
  ArrowClockwiseRegular,
  OpenRegular,
  SearchRegular,
} from '@fluentui/react-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import {
  listMembers,
  type MemberSummary,
  type MemberStatus,
  type SubscriptionSummary,
} from '../api/members';
import { listSeries } from '../api/series';
import { useSession } from '../auth/SessionProvider';
import { ContactsDialog } from '../components/ContactsDialog';
import { PageFrame } from '../components/PageFrame';
import {
  attendanceDescription,
  contactLabel,
  formatAttendance,
  formatDateLong,
  memberInitials,
  memberName,
  subscriptionDescription,
  subscriptionLabel,
} from '../format/member';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    width: '100%',
  },
  toolbar: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  search: {
    flex: '1 1 280px',
    minWidth: '240px',
    maxWidth: '440px',
  },
  statusFilter: {
    minWidth: '150px',
  },
  seriesFilter: {
    minWidth: '200px',
  },
  panel: {
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    minWidth: '960px',
  },
  state: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
    ...shorthands.border('1px', 'dashed', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  memberCell: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minWidth: '220px',
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  memberLink: {
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    textDecoration: 'none',
    ':hover': { textDecoration: 'underline', color: tokens.colorBrandForeground1 },
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
  memberNo: {
    color: tokens.colorNeutralForeground3,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  pills: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  pillTrigger: {
    display: 'inline-flex',
    borderRadius: tokens.borderRadiusMedium,
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
  ministries: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  attendanceTrigger: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    minWidth: '118px',
    borderRadius: tokens.borderRadiusMedium,
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
  attendanceText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
  },
  attendanceTrack: {
    display: 'block',
    width: '100%',
    height: '3px',
    backgroundColor: tokens.colorNeutralBackground4,
    borderRadius: tokens.borderRadiusCircular,
    overflow: 'hidden',
  },
  attendanceFill: {
    display: 'block',
    height: '100%',
    backgroundColor: tokens.colorBrandBackground,
  },
  statusText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'nowrap',
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke2),
    backgroundColor: tokens.colorNeutralBackground2,
  },
  footerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
  },
  emptyTitle: {
    fontWeight: tokens.fontWeightSemibold,
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: 0,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  popoverList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    margin: 0,
    padding: 0,
    listStyleType: 'none',
    maxWidth: '320px',
  },
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function SubscriptionsCell({ subscriptions }: { subscriptions?: readonly SubscriptionSummary[] }) {
  const styles = useStyles();

  if (!subscriptions || subscriptions.length === 0) {
    return <Text className={styles.muted}>—</Text>;
  }

  const visible = subscriptions.slice(0, 2);
  const hidden = subscriptions.length - visible.length;

  return (
    <div className={styles.pills}>
      {visible.map((subscription) => {
        const description = subscriptionDescription(subscription);
        return (
          <Tooltip key={subscription.id} content={description} relationship="description" withArrow>
            <span className={styles.pillTrigger} role="note" tabIndex={0} aria-label={description}>
              <Badge
                appearance="outline"
                color={subscription.kind === 'life_insurance' ? 'brand' : 'informative'}
                size="small"
              >
                {subscriptionLabel(subscription.kind)}
              </Badge>
            </span>
          </Tooltip>
        );
      })}
      {hidden > 0 ? (
        <Popover withArrow>
          <PopoverTrigger disableButtonEnhancement>
            <Button
              size="small"
              appearance="transparent"
              aria-label={`${hidden} more subscriptions`}
            >
              +{hidden}
            </Button>
          </PopoverTrigger>
          <PopoverSurface>
            <ul className={styles.popoverList}>
              {subscriptions.slice(visible.length).map((subscription) => (
                <li key={subscription.id}>
                  <Text weight="semibold">{subscriptionLabel(subscription.kind)}</Text>{' '}
                  <Text size={200}>{subscriptionDescription(subscription)}</Text>
                </li>
              ))}
            </ul>
          </PopoverSurface>
        </Popover>
      ) : null}
    </div>
  );
}

function AttendanceCell({
  summary,
  hasSeries,
}: {
  summary: MemberSummary['attendance'];
  hasSeries: boolean;
}) {
  const styles = useStyles();

  if (!hasSeries) return <Text className={styles.muted}>—</Text>;

  const description = attendanceDescription(summary);
  const percent =
    summary && summary.expected > 0
      ? Math.min(100, Math.round((summary.attended / summary.expected) * 100))
      : 0;

  return (
    <Tooltip content={description} relationship="description" withArrow>
      <span className={styles.attendanceTrigger} role="note" tabIndex={0} aria-label={description}>
        <span className={styles.attendanceText}>{formatAttendance(summary)}</span>
        <span className={styles.attendanceTrack} aria-hidden="true">
          <span className={styles.attendanceFill} style={{ width: `${percent}%` }} />
        </span>
      </span>
    </Tooltip>
  );
}

function StatusCell({ member }: { member: MemberSummary }) {
  const styles = useStyles();
  const label = member.archivedAt ? 'Archived' : 'Active';
  const detail = member.archivedAt
    ? `Archived ${formatDateLong(member.archivedAt)}`
    : 'Active member';

  return (
    <Tooltip content={detail} relationship="description" withArrow>
      <span
        className={styles.statusText}
        role="note"
        tabIndex={0}
        aria-label={`${label}: ${detail}`}
      >
        {label}
      </span>
    </Tooltip>
  );
}

export function MembersPage({ defaultStatus = 'active' }: { defaultStatus?: MemberStatus }) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const [searchParams, setSearchParams] = useSearchParams();
  const status: MemberStatus =
    (searchParams.get('status') ?? defaultStatus) === 'archived' ? 'archived' : 'active';
  const seriesId = searchParams.get('seriesId') ?? '';
  const [searchText, setSearchText] = useState(() => searchParams.get('q') ?? '');
  const debouncedSearch = useDebouncedValue(searchText.trim(), SEARCH_DEBOUNCE_MS);
  const [contactsFor, setContactsFor] = useState<MemberSummary | null>(null);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Keep a shareable, restorable filtered view in the URL (FR-20).
  useEffect(() => {
    if ((searchParams.get('q') ?? '') === debouncedSearch) return;
    setParam('q', debouncedSearch || null);
  }, [debouncedSearch, searchParams, setParam]);

  const membersQuery = useInfiniteQuery({
    queryKey: ['members', baseUrl, status, debouncedSearch, seriesId],
    queryFn: ({ pageParam, signal }) =>
      listMembers(baseUrl, token, {
        q: debouncedSearch || undefined,
        status,
        includeAttendance: Boolean(seriesId),
        seriesId: seriesId || undefined,
        limit: PAGE_SIZE,
        cursor: pageParam || undefined,
        signal,
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(token),
  });

  const seriesQuery = useQuery({
    queryKey: ['series', baseUrl],
    queryFn: ({ signal }) => listSeries(baseUrl, token, { signal }),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (isUnauthorized(membersQuery.error) || isUnauthorized(seriesQuery.error)) {
      void signOut();
    }
  }, [membersQuery.error, seriesQuery.error, signOut]);

  const members = membersQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const seriesOptions = seriesQuery.data ?? [];
  const selectedSeries = seriesOptions.find((series) => series.id === seriesId);
  const isFiltered = debouncedSearch.length > 0 || seriesId.length > 0;

  const emptyTitle = isFiltered
    ? 'No members match'
    : status === 'archived'
      ? 'No archived members'
      : 'No members yet';
  const emptyBody = isFiltered
    ? 'Try a different name, member number or series.'
    : status === 'archived'
      ? 'Archived registrations will appear here when a member is archived.'
      : 'Members will appear here once the register has been imported or a member is added.';

  return (
    <PageFrame
      sectionId="members"
      title="Members"
      submenu={status === 'archived' ? 'Archived' : 'All members'}
      description="Look up a registration, review attendance, ministries and coverage, or open a member record to make changes."
      actions={
        <>
          <Button
            icon={<ArrowClockwiseRegular />}
            onClick={() => {
              void membersQuery.refetch();
            }}
            disabled={membersQuery.isFetching}
          >
            Refresh
          </Button>
          <Button
            as="a"
            href="#/members/new"
            appearance="primary"
            icon={<AddRegular />}
            onClick={(event) => {
              event.preventDefault();
              navigate('/members/new');
            }}
          >
            Add member
          </Button>
        </>
      }
    >
      <div className={styles.page}>
        <div className={styles.toolbar}>
          <SearchBox
            className={styles.search}
            value={searchText}
            placeholder="Search name or member no."
            aria-label="Search members by name or member number"
            contentBefore={<SearchRegular />}
            onChange={(_, data) => setSearchText(data.value)}
          />

          <Dropdown
            className={styles.statusFilter}
            aria-label="Member status"
            value={status === 'archived' ? 'Archived' : 'Active'}
            selectedOptions={[status]}
            onOptionSelect={(_, data) => {
              const next: MemberStatus = data.optionValue === 'archived' ? 'archived' : 'active';
              const nextParams = new URLSearchParams(searchParams);
              nextParams.set('status', next);
              navigate({
                pathname: next === 'archived' ? '/members/archived' : '/members',
                search: nextParams.toString(),
              });
            }}
          >
            <Option value="active">Active</Option>
            <Option value="archived">Archived</Option>
          </Dropdown>

          <Dropdown
            className={styles.seriesFilter}
            aria-label="Attendance series"
            value={selectedSeries?.name ?? 'All series'}
            selectedOptions={[seriesId]}
            onOptionSelect={(_, data) => {
              setParam('seriesId', data.optionValue || null);
            }}
          >
            <Option value="">All series</Option>
            {seriesOptions.map((series) => (
              <Option key={series.id} value={series.id}>
                {series.name}
              </Option>
            ))}
          </Dropdown>
        </div>

        {membersQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Members could not be loaded</MessageBarTitle>
              {errorMessage(membersQuery.error)}
              <Button
                size="small"
                appearance="transparent"
                onClick={() => {
                  void membersQuery.refetch();
                }}
              >
                Retry
              </Button>
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {seriesQuery.isError ? (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>Series unavailable</MessageBarTitle>
              The attendance filter could not load the series list. The grid still works without it.
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {membersQuery.isError ? null : (
          <section className={styles.panel} aria-label="Members">
            {membersQuery.isPending ? (
              <div className={styles.state}>
                <Spinner label="Loading members…" />
              </div>
            ) : members.length === 0 ? (
              <div className={styles.empty}>
                <Text className={styles.emptyTitle}>{emptyTitle}</Text>
                <Text size={200} className={styles.muted}>
                  {emptyBody}
                </Text>
              </div>
            ) : (
              <>
                <div className={styles.tableWrap}>
                  <Table className={styles.table} size="small" aria-label="Members">
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Member</TableHeaderCell>
                        <TableHeaderCell>Contacts</TableHeaderCell>
                        <TableHeaderCell>Ministries</TableHeaderCell>
                        <TableHeaderCell>Subscriptions</TableHeaderCell>
                        <TableHeaderCell>Attendance</TableHeaderCell>
                        <TableHeaderCell>Status</TableHeaderCell>
                        <TableHeaderCell>
                          <span className={styles.visuallyHidden}>Actions</span>
                        </TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((member) => {
                        const name = memberName(member);
                        return (
                          <TableRow key={member.memberNo}>
                            <TableCell>
                              <div className={styles.memberCell}>
                                <Avatar
                                  name={name}
                                  initials={memberInitials(member)}
                                  color="colorful"
                                  size={32}
                                />
                                <div>
                                  <div className={styles.nameRow}>
                                    <Link
                                      className={styles.memberLink}
                                      to={`/members/${encodeURIComponent(member.memberNo)}`}
                                    >
                                      {name}
                                    </Link>
                                    {member.isPresbyter ? (
                                      <Tooltip
                                        content="Eligible to hold a shepherding roster"
                                        relationship="description"
                                      >
                                        <Badge
                                          appearance="tint"
                                          color="informative"
                                          size="small"
                                          role="note"
                                          tabIndex={0}
                                          aria-label="Presbyter: eligible to hold a shepherding roster"
                                        >
                                          Presbyter
                                        </Badge>
                                      </Tooltip>
                                    ) : null}
                                  </div>
                                  <Text size={200} className={styles.memberNo}>
                                    {member.memberNo}
                                  </Text>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="small"
                                appearance="transparent"
                                aria-label={`${contactLabel(member.contactCount)} for ${name}`}
                                onClick={() => setContactsFor(member)}
                              >
                                {contactLabel(member.contactCount)}
                              </Button>
                            </TableCell>
                            <TableCell>
                              {member.ministries.length === 0 ? (
                                <Text className={styles.muted}>—</Text>
                              ) : (
                                <div className={styles.ministries}>
                                  {member.ministries.map((ministry) => (
                                    <Badge
                                      key={ministry.code}
                                      appearance="outline"
                                      color="informative"
                                      size="small"
                                      title={ministry.name}
                                    >
                                      {ministry.code}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <SubscriptionsCell subscriptions={member.subscriptions} />
                            </TableCell>
                            <TableCell>
                              <AttendanceCell
                                summary={member.attendance}
                                hasSeries={seriesId.length > 0}
                              />
                            </TableCell>
                            <TableCell>
                              <StatusCell member={member} />
                            </TableCell>
                            <TableCell>
                              <Button
                                size="small"
                                appearance="subtle"
                                icon={<OpenRegular />}
                                aria-label={`Open ${name} (${member.memberNo})`}
                                onClick={() => {
                                  navigate(`/members/${encodeURIComponent(member.memberNo)}`);
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className={styles.footer}>
                  <Text size={200} className={styles.muted}>
                    {members.length} {status} {members.length === 1 ? 'member' : 'members'} shown ·
                    cursor pagination
                  </Text>
                  <div className={styles.footerActions}>
                    {membersQuery.isFetchingNextPage ? <Spinner size="tiny" /> : null}
                    {membersQuery.hasNextPage ? (
                      <Button
                        size="small"
                        onClick={() => {
                          void membersQuery.fetchNextPage();
                        }}
                        disabled={membersQuery.isFetchingNextPage}
                      >
                        Load more
                      </Button>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </section>
        )}
      </div>

      <ContactsDialog
        member={contactsFor}
        open={contactsFor !== null}
        onOpenChange={(open) => {
          if (!open) setContactsFor(null);
        }}
        onOpenMember={(no) => navigate(`/members/${encodeURIComponent(no)}`)}
      />
    </PageFrame>
  );
}
