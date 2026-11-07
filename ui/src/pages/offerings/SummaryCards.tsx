import { Card, Text } from '@fluentui/react-components';
import type { ChurchOfferingSummary } from '../../api/offerings';
import { formatMoneyMinor } from '../../format/welfare';
import { useOfferingsStyles } from './offerings-styles';

interface Metric {
  readonly label: string;
  readonly value: string;
}

function MetricGrid({ metrics }: { metrics: readonly Metric[] }) {
  const styles = useOfferingsStyles();
  return (
    <div className={styles.metrics}>
      {metrics.map((metric) => (
        <div key={metric.label} className={styles.metric}>
          <Text className={styles.metricLabel}>{metric.label}</Text>
          <Text className={styles.metricValue}>{metric.value}</Text>
        </div>
      ))}
    </div>
  );
}

/**
 * The landing headline: member-only money totals, the pledge counts as at the
 * report date and the separate Visitors card (23-Q10, R1, R3). Visitor money is
 * never added to a member total.
 */
export function SummaryCards({ summary }: { summary: ChurchOfferingSummary }) {
  const styles = useOfferingsStyles();
  const { currency, visitors, pledges } = summary;

  return (
    <section className={styles.cards} aria-label="Offerings totals">
      <Card className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Member giving</h2>
          <Text size={200} className={styles.muted}>
            {currency}
          </Text>
        </div>
        <MetricGrid
          metrics={[
            { label: 'Paid', value: formatMoneyMinor(summary.totalPaidMinor, currency) },
            { label: 'Pledged', value: formatMoneyMinor(summary.totalPledgedMinor, currency) },
            {
              label: 'Outstanding',
              value: formatMoneyMinor(summary.totalOutstandingMinor, currency),
            },
          ]}
        />
        <p className={styles.caption}>
          Member totals only; visitor gifts are separate. Other currencies are excluded rather than
          converted.
        </p>
        <p className={styles.caption}>
          Outstanding is {pledges.pending} pending + {pledges.overdue} overdue as at the report
          date.
        </p>
      </Card>

      <Card className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Pledges</h2>
          <Text size={200} className={styles.muted}>
            As at report date
          </Text>
        </div>
        <MetricGrid
          metrics={[
            { label: 'Pending', value: String(pledges.pending) },
            { label: 'Overdue', value: String(pledges.overdue) },
            { label: 'Honored', value: String(pledges.honored) },
            { label: 'Dishonored', value: String(pledges.dishonored) },
          ]}
        />
        <p className={styles.caption}>
          Pending and overdue are disjoint; together they are the outstanding set. The counts use
          the landing window and the worklist below does not.
        </p>
      </Card>

      <Card className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Visitors</h2>
          <Text size={200} className={styles.muted}>
            Separate from member totals
          </Text>
        </div>
        <MetricGrid
          metrics={[
            { label: 'Gifts', value: String(visitors.count) },
            { label: 'Paid', value: formatMoneyMinor(visitors.paidMinor, currency) },
          ]}
        />
        <p className={styles.caption}>
          Paid visitor contribution rows in the window, counted in {currency}. No contact values are
          read or shown.
        </p>
      </Card>
    </section>
  );
}
