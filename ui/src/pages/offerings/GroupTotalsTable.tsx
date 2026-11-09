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
  readonly countedMinor: number;
}

/**
 * The presentational by-offering/by-event table inside the dashboard breakdown
 * panel. The caller owns the panel header, tabs and footer; this component
 * renders only the table (with the optional share-of-paid bar and row action).
 */
export function GroupTotalsTable({
  ariaLabel,
  nameHeader,
  rows,
  currency,
  emptyTitle,
  emptyHint,
  showShare = false,
  totalPaidMinor = 0,
  showCounted = true,
  renderAction,
}: {
  ariaLabel: string;
  nameHeader: string;
  rows: readonly GroupTotalsRow[];
  currency: string;
  emptyTitle: string;
  emptyHint: string;
  showShare?: boolean;
  totalPaidMinor?: number;
  showCounted?: boolean;
  renderAction?: (row: GroupTotalsRow) => ReactNode;
}) {
  const styles = useOfferingsStyles();

  if (rows.length === 0) {
    return (
      <div className={styles.empty}>
        <Text className={styles.emptyTitle}>{emptyTitle}</Text>
        <Text size={200} className={styles.muted}>
          {emptyHint}
        </Text>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <Table className={styles.table} size="small" aria-label={ariaLabel}>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>{nameHeader}</TableHeaderCell>
            {showShare ? <TableHeaderCell>Share of paid</TableHeaderCell> : null}
            <TableHeaderCell>Paid</TableHeaderCell>
            <TableHeaderCell>Pledged</TableHeaderCell>
            <TableHeaderCell>Outstanding</TableHeaderCell>
            {showCounted ? (
              <TableHeaderCell className={styles.countedDivider}>Counted</TableHeaderCell>
            ) : null}
            {renderAction ? <TableHeaderCell>Terms</TableHeaderCell> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const share =
              totalPaidMinor > 0 ? Math.round((row.paidMinor / totalPaidMinor) * 100) : 0;
            return (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                {showShare ? (
                  <TableCell>
                    <div className={styles.share}>
                      <span className={styles.shareTrack} aria-hidden="true">
                        <span className={styles.shareFill} style={{ width: `${share}%` }} />
                      </span>
                      <span className={styles.sharePct}>{share}%</span>
                    </div>
                  </TableCell>
                ) : null}
                <TableCell>{formatMoneyMinor(row.paidMinor, currency)}</TableCell>
                <TableCell>{formatMoneyMinor(row.pledgedMinor, currency)}</TableCell>
                <TableCell>{formatMoneyMinor(row.outstandingMinor, currency)}</TableCell>
                {showCounted ? (
                  <TableCell className={styles.countedDivider}>
                    {formatMoneyMinor(row.countedMinor, currency)}
                  </TableCell>
                ) : null}
                {renderAction ? <TableCell>{renderAction(row)}</TableCell> : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
