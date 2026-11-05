import {
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
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
import { listOfficers } from '../api/shepherding';
import { useSession } from '../auth/SessionProvider';
import { PageFrame } from '../components/PageFrame';
import { DateWindowControl, useDateWindow } from '../components/DateWindowControl';
import { memberLabelFromName } from '../format/member';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { useShepherdingStyles } from './shepherding-styles';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function rosterHref(memberNo: string, from: string, to: string): string {
  return `/shepherding/roster?officer=${encodeURIComponent(memberNo)}&from=${from}&to=${to}`;
}

/**
 * Shepherding → Officers (FR-58): one row per presbyter with assignments, call
 * totals, last call and the never-called count for the shared window. Selecting
 * a row opens that officer's roster with the same window (FR-59).
 */
export function ShepherdingOfficersPage() {
  const styles = useShepherdingStyles();
  const { formatDate } = useDateTimeFormat();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const [window, setWindow] = useDateWindow();

  const officersQuery = useQuery({
    queryKey: ['shepherding', baseUrl, 'officers', window.from, window.to],
    queryFn: ({ signal }) => listOfficers(baseUrl, token, window, signal),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (isUnauthorized(officersQuery.error)) void signOut();
  }, [officersQuery.error, signOut]);

  const officers = officersQuery.data ?? [];

  return (
    <PageFrame
      sectionId="shepherding"
      title="Shepherding officers"
      submenu="Officers"
      description="Church coverage and the per-officer roster summary. Open an officer to review their members and log a call."
      actions={
        <Button
          icon={<ArrowClockwiseRegular />}
          onClick={() => {
            void officersQuery.refetch();
          }}
          disabled={officersQuery.isFetching}
        >
          Refresh
        </Button>
      }
    >
      <div className={styles.page}>
        <DateWindowControl
          value={window}
          onChange={setWindow}
          label="Shepherding date window"
          hint="UTC dates · calls outside this window are not counted."
        />

        {officersQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Officers could not be loaded</MessageBarTitle>
              {errorMessage(officersQuery.error)}
              <Button
                size="small"
                appearance="transparent"
                onClick={() => {
                  void officersQuery.refetch();
                }}
              >
                Retry
              </Button>
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {officersQuery.isError ? null : (
          <section className={styles.panel} aria-label="Shepherding officers">
            {officersQuery.isPending ? (
              <div className={styles.state}>
                <Spinner label="Loading officers…" />
              </div>
            ) : officers.length === 0 ? (
              <div className={styles.empty}>
                <Text className={styles.emptyTitle}>No shepherding officers</Text>
                <Text size={200} className={styles.muted}>
                  Presbyters appear here once they hold a roster.
                </Text>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <Table className={styles.table} size="small" aria-label="Shepherding officers">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Officer</TableHeaderCell>
                      <TableHeaderCell>Assigned</TableHeaderCell>
                      <TableHeaderCell>Attempts</TableHeaderCell>
                      <TableHeaderCell>Conversations</TableHeaderCell>
                      <TableHeaderCell>Last called</TableHeaderCell>
                      <TableHeaderCell>Never called</TableHeaderCell>
                      <TableHeaderCell>Roster</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {officers.map((officer) => {
                      const label = memberLabelFromName(
                        officer.name || officer.memberNo,
                        officer.gender,
                        officer.age,
                      );
                      return (
                        <TableRow key={officer.memberNo}>
                          <TableCell>
                            <div className={styles.identity}>
                              <Link
                                className={styles.link}
                                to={rosterHref(officer.memberNo, window.from, window.to)}
                              >
                                {label}
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
                              formatDate(officer.lastCalledOn)
                            ) : (
                              <Text className={styles.muted}>Never called</Text>
                            )}
                          </TableCell>
                          <TableCell>
                            {officer.membersNeverCalled > 0 ? (
                              officer.membersNeverCalled
                            ) : (
                              <Text className={styles.muted}>0</Text>
                            )}
                          </TableCell>
                          <TableCell>
                            <Link
                              className={styles.link}
                              to={rosterHref(officer.memberNo, window.from, window.to)}
                              aria-label={`Open the roster for ${label}`}
                            >
                              Open roster
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        )}
      </div>
    </PageFrame>
  );
}
