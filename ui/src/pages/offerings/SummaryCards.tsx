import { Link } from 'react-router-dom';
import type { ChurchOfferingSummary } from '../../api/offerings';
import { formatMoneyMinor } from '../../format/welfare';
import { KpiTile } from './KpiTile';
import { useOfferingsStyles } from './offerings-styles';

/**
 * The four dashboard tiles (accepted 2026-11-09): member paid with visitors
 * separate, counted cash, the signed reconciliation, and open pledges. The
 * tiles own the window totals; counted cash is never added to recorded gifts.
 */
export function SummaryCards({ summary }: { summary: ChurchOfferingSummary }) {
  const styles = useOfferingsStyles();
  const { currency, visitors, pledges } = summary;
  const variance = summary.varianceMinor;
  const under = variance < 0;
  const over = variance > 0;
  const recordedMinor = summary.totalPaidMinor + visitors.paidMinor;

  return (
    <section className={styles.kpis} aria-label="Offerings totals">
      <KpiTile
        label="Member paid"
        value={formatMoneyMinor(summary.totalPaidMinor, currency)}
        caption={`Visitors ${formatMoneyMinor(visitors.paidMinor, currency)} separate`}
      />

      <KpiTile
        label="Counted cash"
        value={formatMoneyMinor(summary.countedMinor, currency)}
        caption="Current observation · corrections keep history"
      />

      <KpiTile
        label="Reconciliation"
        value={formatMoneyMinor(variance, currency)}
        tone={under ? 'negative' : undefined}
        badge={under ? 'Under' : over ? 'Over' : 'Balanced'}
        badgeColor={under ? 'danger' : over ? 'success' : 'informative'}
        visual={
          variance === 0 ? undefined : (
            <div
              className={styles.varianceBar}
              role="img"
              aria-label={`Variance ${formatMoneyMinor(variance, currency)}: counted ${formatMoneyMinor(
                summary.countedMinor,
                currency,
              )} against recorded ${formatMoneyMinor(recordedMinor, currency)}.`}
            >
              <span className={styles.varianceTrack} />
              <span className={styles.varianceZero} />
              <span
                className={under ? styles.varianceUnder : styles.varianceOver}
                style={{ width: '40%' }}
              />
            </div>
          )
        }
        caption={
          <>
            Counted − all recorded offertories; never added.{' '}
            <Link className={styles.link} to="/ussd/offerings">
              Record a count →
            </Link>
          </>
        }
      />

      <KpiTile
        label="Open pledges"
        value={formatMoneyMinor(summary.totalOutstandingMinor, currency)}
        caption={`${pledges.pending} pending · ${pledges.overdue} overdue`}
      />
    </section>
  );
}
