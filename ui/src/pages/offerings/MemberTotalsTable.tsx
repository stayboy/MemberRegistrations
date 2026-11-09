import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import type { OfferingSummaryMember } from '../../api/offerings';
import { formatMoneyMinor } from '../../format/welfare';
import { useOfferingsStyles } from './offerings-styles';

/**
 * The presentational by-member table inside the dashboard breakdown panel: the
 * top 10 by paid, member number and name only, no contact values and no
 * further page (23-Q4, 23-Q10, FR-40).
 */
export function MemberTotalsTable({
  members,
  currency,
  formatDate,
}: {
  members: readonly OfferingSummaryMember[];
  currency: string;
  formatDate: (value: string | null | undefined) => string;
}) {
  const styles = useOfferingsStyles();

  if (members.length === 0) {
    return (
      <div className={styles.empty}>
        <Text className={styles.emptyTitle}>No member giving in this window</Text>
        <Text size={200} className={styles.muted}>
          Widen the date window to include paid member contributions.
        </Text>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <Table className={styles.table} size="small" aria-label="Member totals">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Member</TableHeaderCell>
            <TableHeaderCell>Paid</TableHeaderCell>
            <TableHeaderCell>Pledged</TableHeaderCell>
            <TableHeaderCell>Outstanding</TableHeaderCell>
            <TableHeaderCell>Last given</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.memberNo}>
              <TableCell>
                <div className={styles.identity}>
                  <Text weight="semibold">{member.name}</Text>
                  <Text size={200} className={styles.muted}>
                    {member.memberNo}
                  </Text>
                </div>
              </TableCell>
              <TableCell>{formatMoneyMinor(member.paidMinor, currency)}</TableCell>
              <TableCell>{formatMoneyMinor(member.pledgedMinor, currency)}</TableCell>
              <TableCell>{formatMoneyMinor(member.outstandingMinor, currency)}</TableCell>
              <TableCell>
                {member.lastGivenOn ? (
                  formatDate(member.lastGivenOn)
                ) : (
                  <Text className={styles.muted}>—</Text>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
