import {
  Badge,
  Button,
  Field,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  type BadgeProps,
} from '@fluentui/react-components';
import { ChevronDownRegular, ChevronRightRegular } from '@fluentui/react-icons';
import { Fragment, useState } from 'react';
import type {
  OfferingSummaryPledgeCounts,
  PledgeItem,
  PledgeStatus,
} from '../../api/offerings';
import { formatMoneyMinor } from '../../format/welfare';
import { useOfferingsStyles } from './offerings-styles';

const DEFAULT_LIMIT = 50;
const DEFAULT_ROWS = 5;

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
 * The dashboard pledge worklist: five columns, five rows by default, an
 * expandable row carrying the officer, next reminder and Reassign action, and
 * a client-side `View all` over the existing limit-bounded read. The header is
 * window-scoped; the list is all time and says so.
 */
export function PledgeWorklist({
  pledges,
  windowPledges,
  formatDate,
  onReassign,
  limit = DEFAULT_LIMIT,
}: {
  pledges: readonly PledgeItem[];
  windowPledges: OfferingSummaryPledgeCounts;
  formatDate: (value: string | null | undefined) => string;
  onReassign: (pledge: PledgeItem, officerMemberNo: string) => void;
  limit?: number;
}) {
  const styles = useOfferingsStyles();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewAll, setViewAll] = useState(false);
  const [officerMemberNo, setOfficerMemberNo] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const visible = viewAll ? pledges : pledges.slice(0, DEFAULT_ROWS);
  const hasMore = pledges.length > DEFAULT_ROWS;

  function toggle(pledge: PledgeItem): void {
    setExpandedId((current) => (current === pledge.id ? null : pledge.id));
    setOfficerMemberNo('');
    setLocalError(null);
  }

  function reassign(pledge: PledgeItem): void {
    const officer = officerMemberNo.trim();
    if (!officer) {
      setLocalError('Enter the new follow-up officer member number.');
      return;
    }
    setLocalError(null);
    onReassign(pledge, officer);
  }

  return (
    <section className={styles.panel} aria-label="Pledge worklist">
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Pledge worklist</h2>
        <Text size={200} className={styles.muted}>
          This window: {windowPledges.honored} honored · {windowPledges.dishonored} dishonored
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
        <div className={viewAll ? `${styles.tableWrap} ${styles.worklistScroll}` : styles.tableWrap}>
          <Table className={styles.worklistTable} size="small" aria-label="Pledge worklist">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Member</TableHeaderCell>
                <TableHeaderCell>Offering</TableHeaderCell>
                <TableHeaderCell>Amount</TableHeaderCell>
                <TableHeaderCell>Expected</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((pledge) => {
                const expanded = expandedId === pledge.id;
                const detailId = `pledge-detail-${pledge.id}`;
                return (
                  <Fragment key={pledge.id}>
                    <TableRow>
                      <TableCell>
                        <Button
                          className={styles.expander}
                          size="small"
                          appearance="transparent"
                          icon={
                            expanded ? <ChevronDownRegular /> : <ChevronRightRegular />
                          }
                          aria-expanded={expanded}
                          aria-controls={detailId}
                          aria-label={`${expanded ? 'Hide' : 'Show'} details for ${pledge.memberName}`}
                          onClick={() => toggle(pledge)}
                        />
                        <Text weight="semibold">{pledge.memberName}</Text>{' '}
                        <Text size={200} className={styles.muted}>
                          {pledge.memberNo}
                        </Text>
                      </TableCell>
                      <TableCell>{pledge.offeringName}</TableCell>
                      <TableCell>{formatMoneyMinor(pledge.amountMinor, pledge.currency)}</TableCell>
                      <TableCell>{formatDate(pledge.expectedOn)}</TableCell>
                      <TableCell>
                        <Badge appearance="tint" color={statusColor(pledge.status)} size="small">
                          {statusLabel(pledge.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {expanded ? (
                      <TableRow className={styles.detailRow}>
                        <TableCell colSpan={5}>
                          <div className={styles.detailGrid} id={detailId}>
                            <div className={styles.identity}>
                              <Text size={200} className={styles.muted}>
                                Officer
                              </Text>
                              <Text>{pledge.officerName}</Text>
                            </div>
                            <div className={styles.identity}>
                              <Text size={200} className={styles.muted}>
                                Next reminder
                              </Text>
                              <Text>
                                {pledge.nextReminder ? (
                                  formatDate(pledge.nextReminder)
                                ) : (
                                  <Text className={styles.muted}>—</Text>
                                )}
                              </Text>
                            </div>
                            <div className={styles.identity}>
                              <Text size={200} className={styles.muted}>
                                Pledge status
                              </Text>
                              <Badge appearance="tint" color={statusColor(pledge.status)} size="small">
                                {statusLabel(pledge.status)}
                              </Badge>
                            </div>
                            <Field
                              className={styles.detailField}
                              label="New officer member no"
                              validationState={localError ? 'error' : 'none'}
                              validationMessage={localError ?? undefined}
                            >
                              <Input
                                value={officerMemberNo}
                                placeholder="e.g. M-1002"
                                onChange={(_, data) => setOfficerMemberNo(data.value)}
                              />
                            </Field>
                            <Button
                              size="small"
                              appearance="secondary"
                              aria-label={`Reassign pledge for ${pledge.memberName}`}
                              onClick={() => reassign(pledge)}
                            >
                              Reassign
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className={styles.footer}>
        <Text size={200} className={styles.muted}>
          All time · newest first · up to {limit}
        </Text>
        {hasMore ? (
          <Button size="small" appearance="secondary" onClick={() => setViewAll((value) => !value)}>
            {viewAll ? `Showing ${pledges.length} of up to ${limit} · Collapse` : `View all ${limit}`}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
