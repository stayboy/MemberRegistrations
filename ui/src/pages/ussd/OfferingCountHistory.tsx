import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import { EditRegular } from '@fluentui/react-icons';
import type { OfferingCount } from '../../api/offering-counts';
import { lineSummary } from '../../format/offering-counts';
import { formatMoneyMinor } from '../../format/welfare';
import { useUssdStyles } from './ussd-styles';

/**
 * The append-only observation history for one count group, newest first. A
 * superseded row stays readable and valid for its own `asOf`; only the current
 * row offers Correct.
 */
export function OfferingCountHistory({
  observations,
  currency,
  pending,
  formatInstant,
  onCorrect,
}: {
  observations: readonly OfferingCount[];
  currency: string;
  pending: boolean;
  formatInstant: (value: string) => string;
  onCorrect: (observation: OfferingCount) => void;
}) {
  const styles = useUssdStyles();

  return (
    <section className={styles.panel} aria-label="Offering count observations">
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Observation history</h2>
        <Text size={200} className={styles.muted}>
          Newest first · superseded rows stay readable
        </Text>
      </div>
      {observations.length === 0 ? (
        <div className={styles.empty}>
          <Text size={200} className={styles.muted}>
            No offering count for this event, offering and session yet.
          </Text>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <Table className={styles.table} size="small" aria-label="Offering count observations">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>As of</TableHeaderCell>
                <TableHeaderCell>Lines</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
                <TableHeaderCell>Recorded</TableHeaderCell>
                <TableHeaderCell>State</TableHeaderCell>
                <TableHeaderCell>Action</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {observations.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatInstant(row.asOf)}</TableCell>
                  <TableCell>
                    {row.lines.map((line) => lineSummary(line, row.currency)).join(' · ')}
                  </TableCell>
                  <TableCell>{formatMoneyMinor(row.totalMinor, row.currency)}</TableCell>
                  <TableCell>
                    <Text size={200} className={styles.muted}>
                      {row.recordedBy} · {formatInstant(row.recordedAt)}
                    </Text>
                  </TableCell>
                  <TableCell>
                    {row.supersededBy ? (
                      <Badge appearance="tint" color="subtle" size="small">
                        Superseded
                      </Badge>
                    ) : (
                      <Badge appearance="tint" color="success" size="small">
                        Current
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.supersededBy === null ? (
                      <Button
                        size="small"
                        icon={<EditRegular />}
                        disabled={pending}
                        onClick={() => onCorrect(row)}
                      >
                        Correct
                      </Button>
                    ) : (
                      <Text size={200} className={styles.muted}>
                        Valid for {row.sessionDate} · {row.currency}
                      </Text>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Text size={200} className={styles.muted}>
        Counted cash is shown in {currency} and is never added to member or visitor gifts.
      </Text>
    </section>
  );
}
