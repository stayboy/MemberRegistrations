import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import { AddRegular, ArrowClockwiseRegular } from '@fluentui/react-icons';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ComponentProps } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import {
  getSeriesOccurrences,
  listSeries,
  type SeriesDto,
  type SeriesExceptionDto,
} from '../api/series';
import { useSession } from '../auth/SessionProvider';
import { PageFrame } from '../components/PageFrame';
import { shiftUtcDate } from '../format/date-window';
import { ministryLabel } from '../format/events';
import { utcToday } from '../format/member-form';
import { nextOccurrenceLabel, scheduleLabel, seriesStatusLabel } from '../format/series';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { useEventStyles } from './events-styles';

type BadgeColor = ComponentProps<typeof Badge>['color'];

const NEXT_OCCURRENCE_DAYS = 90;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function currentSchedule(series: SeriesDto) {
  // The DTO carries no "current" marker; the latest effectiveFrom is the version
  // in force (the repository returns versions oldest first).
  return [...series.schedules].sort((left, right) =>
    right.effectiveFrom.localeCompare(left.effectiveFrom),
  )[0];
}

function exceptionSummary(exceptions: readonly SeriesExceptionDto[]): string {
  const cancelled = exceptions.filter((exception) => exception.kind === 'cancelled').length;
  const extra = exceptions.filter((exception) => exception.kind === 'extra').length;
  if (cancelled === 0 && extra === 0) return 'None';
  return `${cancelled} cancelled · ${extra} extra`;
}

function statusColor(archivedAt: string | null): BadgeColor {
  return archivedAt ? 'subtle' : 'success';
}

/**
 * Events → Series (FR-5, FR-42, FR-43). The list shows the current schedule
 * version, the API's next occurrence, exception counts and the archived state.
 * The next occurrence is one request per visible row; it is never derived from
 * the RRULE in the browser.
 */
export function SeriesListPage() {
  const styles = useEventStyles();
  const navigate = useNavigate();
  const { baseUrl, session, signOut } = useSession();
  const { formatDate, formatRange, formatInstantTitle } = useDateTimeFormat();
  const token = session?.token ?? '';
  const [includeArchived, setIncludeArchived] = useState(false);

  const seriesQuery = useQuery({
    queryKey: ['series', baseUrl, 'list', includeArchived],
    queryFn: ({ signal }) => listSeries(baseUrl, token, { includeArchived, signal }),
    enabled: Boolean(token),
  });

  const today = utcToday();
  const occurrenceFrom = today;
  const occurrenceTo = shiftUtcDate(today, NEXT_OCCURRENCE_DAYS) ?? today;
  const series = seriesQuery.data ?? [];

  // Exactly one occurrence request per visible row (FR-43). The first API date
  // is the next occurrence; a row with none says "None in 90 days".
  const occurrenceQueries = useQueries({
    queries: series.map((item) => ({
      queryKey: ['series', baseUrl, 'next-occurrence', item.id, occurrenceFrom, occurrenceTo],
      queryFn: ({ signal }) =>
        getSeriesOccurrences(baseUrl, token, item.id, {
          from: occurrenceFrom,
          to: occurrenceTo,
          signal,
        }),
      enabled: Boolean(token),
      staleTime: 5 * 60_000,
    })),
  });

  const unauthorizedOccurrence = occurrenceQueries.some((query) => isUnauthorized(query.error));

  useEffect(() => {
    if (isUnauthorized(seriesQuery.error) || unauthorizedOccurrence) void signOut();
  }, [seriesQuery.error, unauthorizedOccurrence, signOut]);

  return (
    <PageFrame
      sectionId="events"
      title="Series"
      submenu="Series"
      description="Recurring series, their current schedule and the dates the API generates. Schedule versions and exceptions are append-only history."
      actions={
        <>
          <Button
            icon={<AddRegular />}
            appearance="primary"
            onClick={() => navigate('/events/series/new')}
          >
            New series
          </Button>
          <Button
            icon={<ArrowClockwiseRegular />}
            onClick={() => {
              void seriesQuery.refetch();
              occurrenceQueries.forEach((query) => {
                void query.refetch();
              });
            }}
            disabled={seriesQuery.isFetching}
          >
            Refresh
          </Button>
        </>
      }
    >
      <div className={styles.page}>
        <div className={styles.toolbar}>
          <Switch
            label="Include archived"
            checked={includeArchived}
            onChange={(_, data) => setIncludeArchived(data.checked)}
          />
        </div>

        {seriesQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Series could not be loaded</MessageBarTitle>
              {errorMessage(seriesQuery.error)}
              <Button
                size="small"
                appearance="transparent"
                onClick={() => {
                  void seriesQuery.refetch();
                }}
              >
                Retry
              </Button>
            </MessageBarBody>
          </MessageBar>
        ) : null}

        <section className={styles.panel} aria-label="Series">
          {seriesQuery.isPending ? (
            <div className={styles.state}>
              <Spinner label="Loading series…" />
            </div>
          ) : series.length === 0 ? (
            seriesQuery.isError ? null : (
              <div className={styles.empty}>
                <Text className={styles.emptyTitle}>No series</Text>
                <Text size={200} className={styles.muted}>
                  {includeArchived
                    ? 'No active or archived series exist yet.'
                    : 'No active series exist. Include archived series to review the full history.'}
                </Text>
              </div>
            )
          ) : (
            <div className={styles.tableWrap}>
              <Table className={styles.table} size="small" aria-label="Series">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Ministry</TableHeaderCell>
                    <TableHeaderCell>Timezone</TableHeaderCell>
                    <TableHeaderCell>Schedule</TableHeaderCell>
                    <TableHeaderCell>Next occurrence</TableHeaderCell>
                    <TableHeaderCell>Exceptions</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {series.map((item, index) => {
                    const schedule = currentSchedule(item);
                    const occurrence = occurrenceQueries[index];
                    const nextDate = occurrence?.data?.dates[0] ?? null;

                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Link
                            className={styles.link}
                            to={`/events/series/${encodeURIComponent(item.id)}`}
                          >
                            {item.name}
                          </Link>
                        </TableCell>
                        <TableCell>{ministryLabel(item.ministry)}</TableCell>
                        <TableCell>{item.timezone}</TableCell>
                        <TableCell>
                          {schedule ? (
                            <div className={styles.identity}>
                              <Text>{scheduleLabel(schedule.rrule)}</Text>
                              <Text size={200} className={styles.muted}>
                                {schedule.rrule}
                              </Text>
                            </div>
                          ) : (
                            <Text className={styles.muted}>No schedule</Text>
                          )}
                        </TableCell>
                        <TableCell>
                          {occurrence?.isPending ? (
                            <Text size={200} className={styles.muted}>
                              Loading…
                            </Text>
                          ) : occurrence?.isError ? (
                            <Text size={200} className={styles.muted}>
                              Not available
                            </Text>
                          ) : (
                            nextOccurrenceLabel(nextDate, NEXT_OCCURRENCE_DAYS, formatDate)
                          )}
                        </TableCell>
                        <TableCell>{exceptionSummary(item.exceptions)}</TableCell>
                        <TableCell>
                          <Badge
                            appearance="tint"
                            color={statusColor(item.archivedAt)}
                            size="small"
                            title={
                              item.archivedAt ? formatInstantTitle(item.archivedAt) : undefined
                            }
                          >
                            {seriesStatusLabel(item.archivedAt)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {series.length > 0 ? (
          <Text size={200} className={styles.muted}>
            Next occurrences are requested from the API for{' '}
            {formatRange(occurrenceFrom, occurrenceTo)}. Exceptions are append-only history.
          </Text>
        ) : null}
      </div>
    </PageFrame>
  );
}
