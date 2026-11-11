import { Card, Text } from '@fluentui/react-components';
import type { SeriesSummaryDto } from '../api/series';
import { formatMoneyMinor } from '../format/welfare';
import { useEventStyles } from './events-styles';

function percentLabel(rate: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(rate);
}

function SummaryTile({
  label,
  value,
  caption,
}: {
  label: string;
  value: string | number;
  caption: string;
}) {
  const styles = useEventStyles();
  return (
    <Card className={styles.metric}>
      <Text className={styles.metricLabel}>{label}</Text>
      <Text className={styles.metricValue}>{value}</Text>
      <Text className={styles.metricCaption}>{caption}</Text>
    </Card>
  );
}

/**
 * Call site: SeriesDetailPage (FR-6e). Four presentational tiles fed by one
 * summary request. The occurrence count is the list the page already renders, so
 * the tile and the table cannot disagree; the mock's rail and per-occurrence
 * columns stay queued.
 */
export function SeriesSummaryTiles({
  summary,
  occurrenceCount,
  formatDate,
}: {
  summary: SeriesSummaryDto;
  occurrenceCount: number;
  formatDate: (date: string) => string;
}) {
  const styles = useEventStyles();
  const { attendance, offerings } = summary;
  const { memberSessions, lastHeld, headcountSessions } = attendance;
  const headcountNote =
    headcountSessions.held > 0 ? ` · ${headcountSessions.held} headcount-only` : '';

  return (
    <section className={styles.metrics} aria-label="Series summary">
      <SummaryTile
        label="Next occurrence"
        value={summary.nextOccurrence ? formatDate(summary.nextOccurrence) : 'None in 90 days'}
        caption="From today, up to 90 days"
      />
      <SummaryTile label="Occurrences" value={occurrenceCount} caption="in this window" />
      <SummaryTile
        label="Attendance"
        value={memberSessions.rate === null ? '—' : percentLabel(memberSessions.rate)}
        caption={
          lastHeld
            ? `${lastHeld.present} of ${lastHeld.expected} on ${formatDate(lastHeld.date)}${headcountNote}`
            : 'No held sessions in this window'
        }
      />
      <SummaryTile
        label="Offerings"
        value={offerings.attachedCount}
        caption={
          offerings.attachedCount === 0
            ? 'No offerings attached'
            : `${formatMoneyMinor(offerings.paidMinor, offerings.currency)} paid this window`
        }
      />
    </section>
  );
}
