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
 * Totals by member: the top 10 by paid, tie broken by member number (23-Q4).
 * Member number and name only — never a contact value — with no Follow-up
 * column; the footer is member-only (23-Q10, FR-40).
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

  return (
    <section className={styles.panel} aria-label="Totals by member">
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Totals by member</h2>
        <Text size={200} className={styles.muted}>
          Top 10 by paid · {currency}
        </Text>
      </div>

      {members.length === 0 ? (
        <div className={styles.empty}>
          <Text className={styles.emptyTitle}>No member giving in this window</Text>
          <Text size={200} className={styles.muted}>
            Widen the date window to include paid member contributions.
          </Text>
        </div>
      ) : (
        <>
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
          <div className={styles.footer}>
            <Text size={200} className={styles.muted}>
              Member totals only — visitor gifts are shown separately.
            </Text>
          </div>
        </>
      )}
    </section>
  );
}
