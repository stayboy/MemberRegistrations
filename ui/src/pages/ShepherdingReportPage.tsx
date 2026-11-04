import {
  Button,
  Card,
  Divider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  ProgressBar,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular } from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import { getReport } from '../api/shepherding';
import { useSession } from '../auth/SessionProvider';
import { PageFrame } from '../components/PageFrame';
import { formatDateLong } from '../format/member';
import {
  ShepherdingWindowControl,
  useShepherdingWindow,
} from '../components/ShepherdingWindowControl';
import { useShepherdingStyles } from './shepherding-styles';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function rosterHref(memberNo: string, from: string, to: string): string {
  return `/shepherding/roster?officer=${encodeURIComponent(memberNo)}&from=${from}&to=${to}`;
}

/**
 * Shepherding → Church report (FR-58): church totals, coverage and the
 * still-in-church distribution, then one row per officer. The unassigned figure
 * is a count only; the API exposes no unassigned-member list (FR-60).
 */
export function ShepherdingReportPage() {
  const styles = useShepherdingStyles();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const [window, setWindow] = useShepherdingWindow();

  const reportQuery = useQuery({
    queryKey: ['shepherding', baseUrl, 'report', window.from, window.to],
    queryFn: ({ signal }) => getReport(baseUrl, token, window, signal),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (isUnauthorized(reportQuery.error)) void signOut();
  }, [reportQuery.error, signOut]);

  const report = reportQuery.data;
  const totals = report?.totals;
  // Derived from the report's full aggregate, never from partial pages (FR-68).
  const coveragePercent =
    totals && totals.activeMembers > 0
      ? Math.min(100, Math.round((totals.assignedMembers / totals.activeMembers) * 100))
      : 0;

  return (
    <PageFrame
      sectionId="shepherding"
      title="Church report"
      submenu="Church report"
      description="Church-wide shepherding totals, coverage and the still-in-church distribution for the selected window."
      actions={
        <Button
          icon={<ArrowClockwiseRegular />}
          onClick={() => {
            void reportQuery.refetch();
          }}
          disabled={reportQuery.isFetching}
        >
          Refresh
        </Button>
      }
    >
      <div className={styles.page}>
        <ShepherdingWindowControl value={window} onChange={setWindow} />

        {reportQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The report could not be loaded</MessageBarTitle>
              {errorMessage(reportQuery.error)}
              <Button
                size="small"
                appearance="transparent"
                onClick={() => {
                  void reportQuery.refetch();
                }}
              >
                Retry
              </Button>
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {reportQuery.isPending ? (
          <div className={styles.state}>
            <Spinner label="Loading the church report…" />
          </div>
        ) : reportQuery.isError || !totals ? null : (
          <>
            <div className={styles.cards}>
              <Card className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Church totals</h2>
                  <Text size={200} className={styles.muted}>
                    {formatDateLong(window.from)} to {formatDateLong(window.to)}
                  </Text>
                </div>
                <div className={styles.metrics}>
                  <div className={styles.metric}>
                    <Text className={styles.metricLabel}>Officers</Text>
                    <Text className={styles.metricValue}>{totals.officers}</Text>
                  </div>
                  <div className={styles.metric}>
                    <Text className={styles.metricLabel}>Active members</Text>
                    <Text className={styles.metricValue}>{totals.activeMembers}</Text>
                  </div>
                  <div className={styles.metric}>
                    <Text className={styles.metricLabel}>Assigned</Text>
                    <Text className={styles.metricValue}>{totals.assignedMembers}</Text>
                  </div>
                  <div className={styles.metric}>
                    <Text className={styles.metricLabel}>Unassigned</Text>
                    <Text className={styles.metricValue}>{totals.unassignedMembers}</Text>
                  </div>
                  <div className={styles.metric}>
                    <Text className={styles.metricLabel}>Attempts</Text>
                    <Text className={styles.metricValue}>{totals.attempts}</Text>
                  </div>
                  <div className={styles.metric}>
                    <Text className={styles.metricLabel}>Conversations</Text>
                    <Text className={styles.metricValue}>{totals.conversations}</Text>
                  </div>
                  <div className={styles.metric}>
                    <Text className={styles.metricLabel}>Never called</Text>
                    <Text className={styles.metricValue}>{totals.membersNeverCalled}</Text>
                  </div>
                </div>
                <Divider />
                <Text size={200} className={styles.muted}>
                  Unassigned is a count from the report. The API has no unassigned-member list
                  endpoint, so this screen does not open one.
                </Text>
              </Card>

              <Card className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Coverage</h2>
                  <Text weight="semibold">{coveragePercent}%</Text>
                </div>
                <div className={styles.coverage}>
                  <ProgressBar
                    value={coveragePercent / 100}
                    thickness="large"
                    aria-label={`${totals.assignedMembers} of ${totals.activeMembers} active members are assigned`}
                  />
                  <Text size={200}>
                    {totals.assignedMembers} of {totals.activeMembers} active members are assigned.
                  </Text>
                  <Text size={200} className={styles.muted}>
                    {totals.unassignedMembers} unassigned.
                  </Text>
                </div>
                <Divider />
                <h3 className={styles.cardTitle}>Still in church</h3>
                <div className={styles.metrics}>
                  <div className={styles.metric}>
                    <Text className={styles.metricLabel}>Yes</Text>
                    <Text className={styles.metricValue}>{totals.stillInChurch.yes}</Text>
                  </div>
                  <div className={styles.metric}>
                    <Text className={styles.metricLabel}>No</Text>
                    <Text className={styles.metricValue}>{totals.stillInChurch.no}</Text>
                  </div>
                  <div className={styles.metric}>
                    <Text className={styles.metricLabel}>Unknown</Text>
                    <Text className={styles.metricValue}>{totals.stillInChurch.unknown}</Text>
                  </div>
                  <div className={styles.metric}>
                    <Text className={styles.metricLabel}>Never reported</Text>
                    <Text className={styles.metricValue}>{totals.stillInChurch.neverReported}</Text>
                  </div>
                </div>
              </Card>
            </div>

            <section className={styles.panel} aria-label="Per-officer report">
              {report.officers.length === 0 ? (
                <div className={styles.empty}>
                  <Text className={styles.emptyTitle}>No shepherding officers</Text>
                  <Text size={200} className={styles.muted}>
                    Presbyters appear here once they hold a roster.
                  </Text>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <Table className={styles.table} size="small" aria-label="Per-officer report">
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Officer</TableHeaderCell>
                        <TableHeaderCell>Assigned</TableHeaderCell>
                        <TableHeaderCell>Attempts</TableHeaderCell>
                        <TableHeaderCell>Conversations</TableHeaderCell>
                        <TableHeaderCell>Last called</TableHeaderCell>
                        <TableHeaderCell>Never called</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.officers.map((officer) => (
                        <TableRow key={officer.memberNo}>
                          <TableCell>
                            <div className={styles.identity}>
                              <Link
                                className={styles.link}
                                to={rosterHref(officer.memberNo, window.from, window.to)}
                              >
                                {officer.name || officer.memberNo}
                              </Link>
                              <Text size={200} className={styles.muted}>
                                {officer.memberNo}
                              </Text>
                            </div>
                          </TableCell>
                          <TableCell>{officer.assignedMembers}</TableCell>
                          <TableCell>{officer.attempts}</TableCell>
                          <TableCell>{officer.conversations}</TableCell>
                          <TableCell>
                            {officer.lastCalledOn ? (
                              formatDateLong(officer.lastCalledOn)
                            ) : (
                              <Text className={styles.muted}>Never called</Text>
                            )}
                          </TableCell>
                          <TableCell>{officer.membersNeverCalled}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </PageFrame>
  );
}
