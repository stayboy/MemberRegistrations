import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  ProgressBar,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Tag,
  Text,
} from '@fluentui/react-components';
import {
  ArrowClockwiseRegular,
  CalendarAddRegular,
  CalendarMonthRegular,
} from '@fluentui/react-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, type ComponentProps } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import {
  DEFAULT_EVENT_LIMIT,
  listEventParents,
  type EventParentItem,
  type EventParentStatus,
  type EventRecurrenceSchedule,
} from '../api/events';
import { useSession } from '../auth/SessionProvider';
import { DateWindowControl, useDateWindow } from '../components/DateWindowControl';
import { PageFrame } from '../components/PageFrame';
import { eventStatusLabel, venueLabel } from '../format/events';
import { scheduleLabel } from '../format/series';
import { useEventStyles } from './events-styles';
import { useDateTimeFormat } from '../shell/DateTimeProvider';

type BadgeColor = ComponentProps<typeof Badge>['color'];

const PAGE_SIZE = DEFAULT_EVENT_LIMIT;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function eventHref(eventId: string): string {
  return `/events/${encodeURIComponent(eventId)}`;
}

function statusColor(status: EventParentStatus): BadgeColor {
  if (status === 'active') return 'success';
  if (status === 'archived') return 'subtle';
  return 'informative';
}

/** The summary's server-computed ratio; the browser only formats the number. */
function percentLabel(rate: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(rate);
}

/** The event number and, after it, the venue the mock's first cell carries. */
function identityLine(event: EventParentItem): string {
  const number = event.eventNo || 'No number yet';
  const venue = event.venueName?.trim() || venueLabel(event.venueType);
  return `${number} · ${venue}`;
}

/** `4 events in this window · 3 recurring · 1 standalone`, counted from the rows. */
function footerLabel(events: readonly EventParentItem[]): string {
  const recurring = events.filter((event) => event.recurrence !== null).length;
  return `${events.length} ${events.length === 1 ? 'event' : 'events'} in this window · ${recurring} recurring · ${events.length - recurring} standalone`;
}

/**
 * The detail's rule (FR-6): the schedule version with the latest `effectiveFrom`
 * wins. The list labels that version's RRULE through `scheduleLabel` and never
 * expands it into dates (FR-5).
 */
function latestSchedule(event: EventParentItem): EventRecurrenceSchedule | null {
  if (!event.recurrence) return null;
  return (
    [...event.recurrence.schedules].sort((left, right) =>
      right.effectiveFrom.localeCompare(left.effectiveFrom),
    )[0] ?? null
  );
}

/**
 * Events → Events (events FR-1/FR-2/FR-5, UI FR-42): the date-window list read
 * through `view=parent`, one row per event. Each row shows the event name and
 * its Repeats/Standalone tag, the event number with its venue, the audience
 * summary exactly as the server renders it (as a tag), and its dates: a
 * recurring event's human-readable schedule label beside the server's next
 * occurrence (or an explicit empty state), a standalone event's own date range.
 * The window attendance (text plus its bar) and offering figures and the stored
 * status follow. A draft parent carries the FR-42 Draft badge. Selecting the
 * event name opens the detail.
 */
export function EventsListPage() {
  const styles = useEventStyles();
  const navigate = useNavigate();
  const { baseUrl, session, signOut } = useSession();
  const { formatDate, formatRange } = useDateTimeFormat();
  const token = session?.token ?? '';
  const [window, setWindow] = useDateWindow();

  const eventsQuery = useInfiniteQuery({
    queryKey: ['events', baseUrl, 'list', window.from, window.to],
    queryFn: ({ signal, pageParam }) =>
      listEventParents(baseUrl, token, {
        ...window,
        limit: PAGE_SIZE,
        offset: pageParam === 0 ? undefined : pageParam,
        signal,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.length < PAGE_SIZE ? undefined : lastPageParam + PAGE_SIZE,
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (isUnauthorized(eventsQuery.error)) {
      void signOut();
    }
  }, [eventsQuery.error, signOut]);

  const events = eventsQuery.data?.pages.flat() ?? [];
  const loadedCount = events.length;

  return (
    <PageFrame
      sectionId="events"
      title="Events"
      submenu="Events"
      description="Every dated event, whether generated from a series or created for a one-off conference. Attendance is per event date."
      actions={[
        {
          id: 'new-event',
          kind: 'verb',
          label: 'New event',
          icon: <CalendarAddRegular />,
          onSelect: () => navigate('/events/new'),
        },
        {
          id: 'new-series',
          kind: 'verb',
          label: 'New series',
          icon: <CalendarMonthRegular />,
          onSelect: () => navigate('/events/series/new'),
        },
        {
          id: 'refresh',
          kind: 'utility',
          label: 'Refresh',
          icon: <ArrowClockwiseRegular />,
          onSelect: () => {
            void eventsQuery.refetch();
          },
          disabled: eventsQuery.isFetching,
        },
      ]}
    >
      <div className={styles.page}>
        <div className={styles.toolbar}>
          <DateWindowControl
            value={window}
            onChange={setWindow}
            label="Events date window"
            hint="UTC dates · events outside this window are not shown."
          />
        </div>

        {eventsQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Events could not be loaded</MessageBarTitle>
              {errorMessage(eventsQuery.error)}
              <Button
                size="small"
                appearance="transparent"
                onClick={() => {
                  void eventsQuery.refetch();
                }}
              >
                Retry
              </Button>
            </MessageBarBody>
          </MessageBar>
        ) : null}

        <section className={styles.panel} aria-label="Events">
          {eventsQuery.isPending ? (
            <div className={styles.state}>
              <Spinner label="Loading events…" />
            </div>
          ) : loadedCount === 0 ? (
            eventsQuery.isError ? null : (
              <div className={styles.empty}>
                <Text className={styles.emptyTitle}>No events in this window</Text>
                <Text size={200} className={styles.muted}>
                  Widen the date window to review held, scheduled or cancelled events.
                </Text>
              </div>
            )
          ) : (
            <>
              <div className={styles.tableWrap}>
                <Table className={styles.table} size="small" aria-label="Events">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Event</TableHeaderCell>
                      <TableHeaderCell>Audience</TableHeaderCell>
                      <TableHeaderCell>When</TableHeaderCell>
                      <TableHeaderCell>Attendance</TableHeaderCell>
                      <TableHeaderCell>Offerings</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => {
                      const { attendance, offerings } = event.summary;
                      const memberSessions = attendance.memberSessions;
                      const schedule = latestSchedule(event);
                      return (
                        <TableRow key={event.id}>
                          <TableCell>
                            <div className={styles.identity}>
                              <div className={styles.metaValue}>
                                <Link className={styles.link} to={eventHref(event.id)}>
                                  {event.name}
                                </Link>
                                <Badge
                                  appearance="tint"
                                  color={event.recurrence ? 'informative' : 'subtle'}
                                  size="small"
                                >
                                  {event.recurrence ? 'Repeats' : 'Standalone'}
                                </Badge>
                              </div>
                              <Text size={200} className={styles.muted}>
                                {identityLine(event)}
                              </Text>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Tag
                              appearance="outline"
                              size="small"
                              className={styles.audienceTag}
                              primaryText={{ className: styles.audienceTagText }}
                              title={event.audience.summary}
                            >
                              {event.audience.name}
                            </Tag>
                          </TableCell>
                          <TableCell>
                            {event.recurrence ? (
                              <div className={styles.when}>
                                {schedule ? (
                                  <Text size={200}>{scheduleLabel(schedule.rrule)}</Text>
                                ) : null}
                                {event.summary.nextOccurrence ? (
                                  <Text size={200}>{formatDate(event.summary.nextOccurrence)}</Text>
                                ) : (
                                  <Text size={200} className={styles.muted}>
                                    None in 90 days
                                  </Text>
                                )}
                              </div>
                            ) : (
                              formatRange(event.startDate, event.endDate)
                            )}
                          </TableCell>
                          <TableCell>
                            {memberSessions.held === 0 ? (
                              <Text size={200} className={styles.muted}>
                                —
                              </Text>
                            ) : (
                              <div className={styles.counts}>
                                <Text size={200}>
                                  {memberSessions.present}/{memberSessions.expected}
                                  {memberSessions.rate === null
                                    ? ''
                                    : ` · ${percentLabel(memberSessions.rate)}`}
                                </Text>
                                {memberSessions.rate === null ? null : (
                                  <ProgressBar
                                    aria-hidden
                                    value={memberSessions.rate}
                                    thickness="medium"
                                  />
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {offerings.attachedCount === 0
                              ? 'None'
                              : `${offerings.attachedCount} attached`}
                          </TableCell>
                          <TableCell>
                            <Badge appearance="tint" color={statusColor(event.status)} size="small">
                              {eventStatusLabel(event.status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className={styles.listFooter}>
                <Text size={200} className={styles.muted}>
                  {footerLabel(events)}
                </Text>
                {eventsQuery.hasNextPage ? (
                  <Button
                    appearance="secondary"
                    onClick={() => {
                      void eventsQuery.fetchNextPage();
                    }}
                    disabled={eventsQuery.isFetchingNextPage}
                  >
                    {eventsQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </PageFrame>
  );
}
