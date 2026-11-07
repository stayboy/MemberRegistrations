import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import type { ReactNode } from 'react';
import { formatMoneyMinor } from '../../format/welfare';
import { useOfferingsStyles } from './offerings-styles';

export interface GroupTotalsRow {
  readonly id: string;
  readonly name: string;
  readonly paidMinor: number;
  readonly pledgedMinor: number;
  readonly outstandingMinor: number;
}

/**
 * One totals table shape shared by the by-offering and by-event panels (FR-30).
 * A caller may add a per-row action, such as the offering terms dialog.
 */
export function GroupTotalsTable({
  title,
  ariaLabel,
  nameHeader,
  rows,
  currency,
  emptyTitle,
  emptyHint,
  renderAction,
}: {
  title: string;
  ariaLabel: string;
  nameHeader: string;
  rows: readonly GroupTotalsRow[];
  currency: string;
  emptyTitle: string;
  emptyHint: string;
  renderAction?: (row: GroupTotalsRow) => ReactNode;
}) {
  const styles = useOfferingsStyles();

  return (
    <section className={styles.panel} aria-label={ariaLabel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{title}</h2>
        <Text size={200} className={styles.muted}>
          {currency}
        </Text>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <Text className={styles.emptyTitle}>{emptyTitle}</Text>
          <Text size={200} className={styles.muted}>
            {emptyHint}
          </Text>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <Table className={styles.table} size="small" aria-label={ariaLabel}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{nameHeader}</TableHeaderCell>
                <TableHeaderCell>Paid</TableHeaderCell>
                <TableHeaderCell>Pledged</TableHeaderCell>
                <TableHeaderCell>Outstanding</TableHeaderCell>
                {renderAction ? <TableHeaderCell>Terms</TableHeaderCell> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{formatMoneyMinor(row.paidMinor, currency)}</TableCell>
                  <TableCell>{formatMoneyMinor(row.pledgedMinor, currency)}</TableCell>
                  <TableCell>{formatMoneyMinor(row.outstandingMinor, currency)}</TableCell>
                  {renderAction ? <TableCell>{renderAction(row)}</TableCell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
