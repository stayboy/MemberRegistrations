import { Card, Text } from '@fluentui/react-components';
import type { SeriesSummaryDto } from '../api/series';
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
 * Call site: EventDetailPage's parent read (the retired SeriesDetailPage used it
 * too, FR-6e). Four presentational tiles fed by one summary request. The
 * occurrence count is the list the page already renders, so the tile and the
 * table cannot disagree; the mock's rail and per-occurrence columns stay queued.
 *
 * The Offerings tile is a **count with no money in it** (owner, 2026-11-26): an
 * offering is not tied to one currency, so its caption names the attachment only
 * and the names live in the identity card's summary row.
 */
export function SeriesSummaryTiles({
  summary,
  occurrenceCount,
  formatDate,
  label = 'Series summary',
  expectedLabel,
}: {
  summary: SeriesSummaryDto;
  occurrenceCount: number;
  formatDate: (date: string) => string;
  /** The region's accessible name; an event detail passes "Event summary". */
  label?: string;
  /**
   * "Roster" on both detail pages: the expected count is the transitional roster
   * (FR-6e, amended 2026-11-23), so it is labelled and kept apart from present.
   */
  expectedLabel?: string;
}) {
  const styles = useEventStyles();
  const { attendance, offerings } = summary;
  const { memberSessions, lastHeld, headcountSessions } = attendance;
  const headcountNote =
    headcountSessions.held > 0 ? ` · ${headcountSessions.held} headcount-only` : '';
  const lastHeldCaption = lastHeld
    ? expectedLabel
      ? `${lastHeld.present} present · ${expectedLabel} ${lastHeld.expected} on ${formatDate(lastHeld.date)}${headcountNote}`
      : `${lastHeld.present} of ${lastHeld.expected} on ${formatDate(lastHeld.date)}${headcountNote}`
    : 'No held sessions in this window';

  return (
    <section className={styles.metrics} aria-label={label}>
      <SummaryTile
        label="Next occurrence"
        value={summary.nextOccurrence ? formatDate(summary.nextOccurrence) : 'None in 90 days'}
        caption="From today, up to 90 days"
      />
      <SummaryTile label="Occurrences" value={occurrenceCount} caption="in this window" />
      <SummaryTile
        label="Attendance"
        value={memberSessions.rate === null ? '—' : percentLabel(memberSessions.rate)}
        caption={lastHeldCaption}
      />
      <SummaryTile
        label="Offerings"
        value={offerings.attachedCount}
        caption="attached to this event"
      />
    </section>
  );
}
