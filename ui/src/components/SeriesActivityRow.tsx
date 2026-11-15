import { Badge, TableCell, TableRow, Text, makeStyles, tokens } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSession } from '../auth/SessionProvider';
import { getSeriesOccurrences, type SeriesDto } from '../api/series';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { nextOccurrenceLabel, scheduleLabel, seriesStatusLabel } from '../format/series';
import { ministryLabel } from '../format/events';

const useStyles = makeStyles({
  identity: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  link: {
    color: tokens.colorBrandForegroundLink,
    fontWeight: tokens.fontWeightSemibold,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
});

/** The UTC date `offsetDays` from today, in the series' own timezone - "today" is the series' (FR-6b). */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

function shift(date: string, offsetDays: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

/**
 * A series as one row in the events list (owner, 2026-11-15): the same kind of activity as an event,
 * differing only in what the Dates column says - a schedule and its next occurrence instead of a range.
 *
 * `SeriesDto` carries no next occurrence, so this row reads the series' own occurrences over a 90-day
 * window: one bounded read per series, which is the cost of not adding a field to the wire. An archived
 * series is not read at all - it has no next occurrence to show.
 */
export function SeriesActivityRow({ series }: { series: SeriesDto }) {
  const styles = useStyles();
  const { baseUrl, session } = useSession();
  const { formatDate } = useDateTimeFormat();
  const token = session?.token ?? '';

  const latest = series.schedules.at(-1);
  const schedule = latest ? scheduleLabel(latest.rrule) : 'No schedule yet';
  const archived = series.archivedAt !== null;

  const windowQuery = useQuery({
    queryKey: ['series', baseUrl, 'occurrences', series.id, 'next'],
    queryFn: ({ signal }) =>
      getSeriesOccurrences(baseUrl, token, series.id, {
        from: todayIn(series.timezone),
        to: shift(todayIn(series.timezone), 90),
        signal,
      }),
    enabled: Boolean(token) && !archived,
    retry: false,
  });

  const next = windowQuery.data?.dates[0];

  return (
    <TableRow>
      <TableCell>
        <div className={styles.identity}>
          <Text size={200}>{schedule}</Text>
          <Text size={100} className={styles.muted}>
            {archived
              ? 'no next occurrence'
              : next
                ? `next ${formatDate(next)}`
                : nextOccurrenceLabel(null, 90, formatDate)}
          </Text>
        </div>
      </TableCell>
      <TableCell>
        <div className={styles.identity}>
          <Link className={styles.link} to={`/events/${encodeURIComponent(series.id)}?kind=series`}>
            {series.name}
          </Link>
          <Text size={100} className={styles.muted}>
            Series
          </Text>
        </div>
      </TableCell>
      <TableCell>{ministryLabel(series.ministry)}</TableCell>
      {[0, 1, 2, 3].map((column) => (
        <TableCell key={column}>
          <Text size={200} className={styles.muted}>
            —
          </Text>
        </TableCell>
      ))}
      <TableCell>
        <Badge appearance="tint" color={archived ? 'subtle' : 'success'} size="small">
          {seriesStatusLabel(series.archivedAt)}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
