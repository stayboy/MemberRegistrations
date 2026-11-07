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
  type BadgeProps,
} from '@fluentui/react-components';
import type { PledgeItem, PledgeStatus } from '../../api/offerings';
import { formatMoneyMinor } from '../../format/welfare';
import { useOfferingsStyles } from './offerings-styles';

function statusColor(status: PledgeStatus): BadgeProps['color'] {
  if (status === 'honored') return 'success';
  if (status === 'overdue') return 'danger';
  if (status === 'dishonored') return 'subtle';
  return 'informative';
}

function statusLabel(status: PledgeStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * "Pledges and follow-up": the unwindowed `GET /v1/pledges` page rendered
 * as-is, newest first and bounded by the route's limit (R3, 23-Q9). The member,
 * officer and offering names come from the API (R5); reassignment is handled by
 * the page through the shared ReasonDialog.
 */
export function PledgeWorklist({
  pledges,
  scopeLabel,
  formatDate,
  onReassign,
}: {
  pledges: readonly PledgeItem[];
  scopeLabel: string;
  formatDate: (value: string | null | undefined) => string;
  onReassign: (pledge: PledgeItem) => void;
}) {
  const styles = useOfferingsStyles();

  return (
    <section className={styles.panel} aria-label="Pledges and follow-up">
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Pledges and follow-up</h2>
        <Text size={200} className={styles.muted}>
          {scopeLabel}
        </Text>
      </div>

      {pledges.length === 0 ? (
        <div className={styles.empty}>
          <Text className={styles.emptyTitle}>No pledges to follow up</Text>
          <Text size={200} className={styles.muted}>
            Pledges appear here as soon as they are recorded; the list is not limited to the landing
            window.
          </Text>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <Table className={styles.worklistTable} size="small" aria-label="Pledge worklist">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Member</TableHeaderCell>
                <TableHeaderCell>Offering</TableHeaderCell>
                <TableHeaderCell>Amount</TableHeaderCell>
                <TableHeaderCell>Expected</TableHeaderCell>
                <TableHeaderCell>Officer</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Next reminder</TableHeaderCell>
                <TableHeaderCell>Action</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pledges.map((pledge) => (
                <TableRow key={pledge.id}>
                  <TableCell>
                    <div className={styles.identity}>
                      <Text weight="semibold">{pledge.memberName}</Text>
                      <Text size={200} className={styles.muted}>
                        {pledge.memberNo}
                      </Text>
                    </div>
                  </TableCell>
                  <TableCell>{pledge.offeringName}</TableCell>
                  <TableCell>{formatMoneyMinor(pledge.amountMinor, pledge.currency)}</TableCell>
                  <TableCell>{formatDate(pledge.expectedOn)}</TableCell>
                  <TableCell>{pledge.officerName}</TableCell>
                  <TableCell>
                    <Badge appearance="tint" color={statusColor(pledge.status)} size="small">
                      {statusLabel(pledge.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {pledge.nextReminder ? (
                      formatDate(pledge.nextReminder)
                    ) : (
                      <Text className={styles.muted}>—</Text>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      appearance="secondary"
                      aria-label={`Reassign pledge for ${pledge.memberName}`}
                      onClick={() => onReassign(pledge)}
                    >
                      Reassign
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
