import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import { Link } from 'react-router-dom';
import type { ContributionItem } from '../../api/giving';
import { formatMoneyMinor } from '../../format/welfare';
import { useUssdStyles } from './ussd-styles';

/**
 * The session-scoped offertories list on the count page. It reads the existing
 * `GET /v1/contributions` filtered by event, offering and session date; the
 * pledge list is deliberately not built (go-forward grill A5).
 */
export function RecordedOffertoriesList({
  contributions,
  offeringName,
  currency,
  expanded,
  formatInstant,
  onToggle,
  onRecord,
}: {
  contributions: readonly ContributionItem[];
  offeringName: string;
  currency: string;
  expanded: boolean;
  formatInstant: (value: string) => string;
  onToggle: () => void;
  onRecord: () => void;
}) {
  const styles = useUssdStyles();

  return (
    <section className={styles.panel} aria-label="Recorded offertories this session">
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Recorded this session</h2>
        <div className={styles.badgeRow}>
          <Text size={200} className={styles.muted}>
            {contributions.length} offertories · newest first
          </Text>
          <Button size="small" appearance="primary" onClick={onRecord}>
            Record offertory
          </Button>
          <Button size="small" appearance="secondary" onClick={onToggle}>
            {expanded ? 'Hide' : 'Show'}
          </Button>
        </div>
      </div>

      {expanded ? (
        contributions.length === 0 ? (
          <div className={styles.empty}>
            <Text size={200} className={styles.muted}>
              No offertories recorded for this event, offering and session yet.
            </Text>
          </div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <Table className={styles.table} size="small" aria-label="Recorded offertories this session">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Member</TableHeaderCell>
                    <TableHeaderCell>Offertory</TableHeaderCell>
                    <TableHeaderCell>Amount</TableHeaderCell>
                    <TableHeaderCell>Recorded</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contributions.map((contribution) => (
                    <TableRow key={contribution.id}>
                      <TableCell>
                        {contribution.memberNo ?? contribution.visitorName ?? 'Visitor'}
                      </TableCell>
                      <TableCell>{offeringName}</TableCell>
                      <TableCell>
                        {formatMoneyMinor(contribution.amountMinor, contribution.currency || currency)}
                      </TableCell>
                      <TableCell>{formatInstant(contribution.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className={styles.panelFoot}>
              <Text size={200} className={styles.muted}>
                Showing {contributions.length} · newest first
              </Text>
              <Link className={styles.link} to="/events/offerings">
                View all in Offerings
              </Link>
            </div>
          </>
        )
      ) : null}
    </section>
  );
}
