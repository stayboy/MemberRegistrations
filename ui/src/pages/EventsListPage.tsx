import {
  Badge,
  Button,
  Dropdown,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular } from '@fluentui/react-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ComponentProps } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import {
  DEFAULT_EVENT_LIMIT,
  listEvents,
  type EventStatus,
  type EventVenueType,
} from '../api/events';
import { listSeries } from '../api/series';
import { useSession } from '../auth/SessionProvider';
import { DateWindowControl, useDateWindow } from '../components/DateWindowControl';
import { PageFrame } from '../components/PageFrame';
import { seedEventsListQuery } from '../format/events-list';
import {
  eventStatusLabel,
  formatDateRange,
  ministryLabel,
  offeringsLabel,
  seriesColumnLabel,
  sessionAttendanceLabels,
  venueLabel,
} from '../format/events';
import { useEventStyles } from './events-styles';

type BadgeColor = ComponentProps<typeof Badge>['color'];

const PAGE_SIZE = DEFAULT_EVENT_LIMIT;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function eventHref(eventId: string): string {
  return `/events/${encodeURIComponent(eventId)}`;
}

function venueColor(venueType: EventVenueType): BadgeColor {
  if (venueType === 'hybrid') return 'brand';
  if (venueType === 'virtual') return 'subtle';
  return 'informative';
}

function statusColor(status: EventStatus): BadgeColor {
  if (status === 'held') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'scheduled') return 'informative';
  return 'subtle';
}

/**
 * Events → Events (events FR-1/FR-2): the date-window list. Each row shows the
 * date range, the event and number, the series or Standalone, the venue badge,
 * the API's per-session attendance counts, the attached-offering count and the
 * server-derived status. Selecting the event name opens the detail.
 */
export function EventsListPage() {
  const styles = useEventStyles();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const [searchParams, setSearchParams] = useSearchParams();
  const [window, setWindow] = useDateWindow();

  // The occurrence link carries `?series=<id>&from&to` (FR-43). `useDateWindow`
  // reads the URL-backed window on first render; the series filter is read once
  // here so a later window change cannot silently re-seed it.
  const [seriesId, setSeriesId] = useState(() => seedEventsListQuery(searchParams).seriesId);

  const seriesQuery = useQuery({
    queryKey: ['series', baseUrl, 'events-filter'],
    queryFn: ({ signal }) => listSeries(baseUrl, token, { includeArchived: true, signal }),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });

  const eventsQuery = useInfiniteQuery({
    queryKey: ['events', baseUrl, 'list', window.from, window.to, seriesId],
    queryFn: ({ signal, pageParam }) =>
      listEvents(baseUrl, token, {
        ...window,
        seriesId: seriesId || undefined,
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
    if (isUnauthorized(eventsQuery.error) || isUnauthorized(seriesQuery.error)) {
      void signOut();
    }
  }, [eventsQuery.error, seriesQuery.error, signOut]);

  const events = eventsQuery.data?.pages.flat() ?? [];
  const loadedCount = events.length;
  const seriesOptions = seriesQuery.data ?? [];
  const selectedSeries = seriesOptions.find((series) => series.id === seriesId);

  function selectSeries(next: string): void {
    setSeriesId(next);
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (next) params.set('series', next);
        else params.delete('series');
        return params;
      },
      { replace: true },
    );
  }

  return (
    <PageFrame
      sectionId="events"
      title="Events"
      submenu="Events"
      description="Every dated event, whether generated from a series or created for a one-off conference. Attendance is per event date."
      actions={
        <Button
          icon={<ArrowClockwiseRegular />}
          onClick={() => {
            void eventsQuery.refetch();
          }}
          disabled={eventsQuery.isFetching}
        >
          Refresh
        </Button>
      }
    >
      <div className={styles.page}>
        <div className={styles.toolbar}>
          <DateWindowControl
            value={window}
            onChange={setWindow}
            label="Events date window"
            hint="UTC dates · events outside this window are not shown."
          />
          <Dropdown
            className={styles.seriesFilter}
            aria-label="Series filter"
            value={selectedSeries?.name ?? (seriesId ? 'Selected series' : 'All series')}
            selectedOptions={seriesId ? [seriesId] : []}
            onOptionSelect={(_, data) => selectSeries(data.optionValue ?? '')}
          >
            <Option value="">All series</Option>
            {seriesOptions.map((series) => (
              <Option key={series.id} value={series.id}>
                {series.archivedAt ? `${series.name} (archived)` : series.name}
              </Option>
            ))}
          </Dropdown>
        </div>

        {seriesQuery.isError ? (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>Series unavailable</MessageBarTitle>
              The series filter could not load the series list. The events grid still works without
              it.
            </MessageBarBody>
          </MessageBar>
        ) : null}

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
                <Text className={styles.emptyTitle}>
                  {seriesId
                    ? 'No events for this series in this window'
                    : 'No events in this window'}
                </Text>
                <Text size={200} className={styles.muted}>
                  {seriesId
                    ? 'Widen the date window or clear the series filter to review other events.'
                    : 'Widen the date window to review held, scheduled or cancelled events.'}
                </Text>
              </div>
            )
          ) : (
            <>
              <div className={styles.tableWrap}>
                <Table className={styles.table} size="small" aria-label="Events">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Dates</TableHeaderCell>
                      <TableHeaderCell>Event</TableHeaderCell>
                      <TableHeaderCell>Ministry</TableHeaderCell>
                      <TableHeaderCell>Series</TableHeaderCell>
                      <TableHeaderCell>Venue</TableHeaderCell>
                      <TableHeaderCell>Attendance</TableHeaderCell>
                      <TableHeaderCell>Offerings</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>{formatDateRange(event.startDate, event.endDate)}</TableCell>
                        <TableCell>
                          <div className={styles.identity}>
                            <Link className={styles.link} to={eventHref(event.id)}>
                              {event.name}
                            </Link>
                            <Text size={200} className={styles.muted}>
                              {event.eventNo ?? 'No number yet'}
                            </Text>
                          </div>
                        </TableCell>
                        <TableCell>{ministryLabel(event.ministry)}</TableCell>
                        <TableCell>{seriesColumnLabel(event)}</TableCell>
                        <TableCell>
                          <div className={styles.venue}>
                            <Badge
                              appearance="tint"
                              color={venueColor(event.venueType)}
                              size="small"
                            >
                              {venueLabel(event.venueType)}
                            </Badge>
                            {event.venueName ? (
                              <Text size={200} className={styles.muted}>
                                {event.venueName}
                              </Text>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          {event.sessions.length === 0 ? (
                            <Text className={styles.muted}>—</Text>
                          ) : (
                            <div className={styles.counts}>
                              <Text size={200}>{sessionAttendanceLabels(event.sessions)}</Text>
                              <Text size={100} className={styles.muted}>
                                present/expected per date
                              </Text>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{offeringsLabel(event.offerings.length)}</TableCell>
                        <TableCell>
                          <Badge appearance="tint" color={statusColor(event.status)} size="small">
                            {eventStatusLabel(event.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className={styles.listFooter}>
                <Text size={200} className={styles.muted}>
                  {loadedCount} events loaded
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
