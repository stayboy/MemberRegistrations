import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
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
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { isUnauthorized } from '../api/errors';
import { getEventAttendance, type EventSessionItem } from '../api/events';
import { useSession } from '../auth/SessionProvider';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { useEventStyles } from './events-styles';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The attendance report could not be loaded.';
}

/**
 * The read-only session attendance dialog (events FR-10, AC-17). It renders the
 * API's present/expected/importedRows and rows exactly as returned. When the
 * report errors it shows the API message and no counts or rows, because the UI
 * must never invent absence records (FR-10).
 *
 * Call site: EventDetailPage only. The report rows carry no attendance id, so a
 * row delete needs a DTO change first; this dialog is read-only.
 */
export function EventAttendanceDialog({
  open,
  eventId,
  session,
  onClose,
}: {
  open: boolean;
  eventId: string;
  session: EventSessionItem | null;
  onClose: () => void;
}) {
  const styles = useEventStyles();
  const { baseUrl, session: credential, signOut } = useSession();
  const { formatDate, formatTime } = useDateTimeFormat();
  const token = credential?.token ?? '';
  const date = session?.date ?? '';

  const attendanceQuery = useQuery({
    queryKey: ['events', baseUrl, 'attendance', eventId, date],
    queryFn: ({ signal }) => getEventAttendance(baseUrl, token, eventId, date, signal),
    enabled: open && session !== null && Boolean(token),
  });

  useEffect(() => {
    if (isUnauthorized(attendanceQuery.error)) void signOut();
  }, [attendanceQuery.error, signOut]);

  const report = attendanceQuery.data;

  return (
    <Dialog
      open={open && session !== null}
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface className={styles.dialogSurface}>
        <DialogBody>
          <DialogTitle>
            {session ? `Attendance · ${formatDate(session.date)}` : 'Attendance'}
          </DialogTitle>
          <DialogContent className={styles.dialogContent}>
            <MessageBar intent="info">
              <MessageBarBody>
                Attendance is recorded against this event date. The source column distinguishes
                imported rows from manual entries.
              </MessageBarBody>
            </MessageBar>

            {attendanceQuery.isPending ? (
              <Spinner label="Loading attendance…" />
            ) : attendanceQuery.isError ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>Attendance is not available for this session</MessageBarTitle>
                  {errorMessage(attendanceQuery.error)}
                  <Button
                    size="small"
                    appearance="transparent"
                    onClick={() => {
                      void attendanceQuery.refetch();
                    }}
                  >
                    Retry
                  </Button>
                </MessageBarBody>
              </MessageBar>
            ) : report ? (
              <>
                <div className={styles.metrics}>
                  <div className={styles.metric}>
                    <Text className={styles.metricLabel}>Present</Text>
                    <Text className={styles.metricValue}>{report.present}</Text>
                  </div>
                  <div className={styles.metric}>
                    <Text className={styles.metricLabel}>Expected</Text>
                    <Text className={styles.metricValue}>{report.expected}</Text>
                  </div>
                  <div className={styles.metric}>
                    <Text className={styles.metricLabel}>Imported rows</Text>
                    <Text className={styles.metricValue}>{report.importedRows}</Text>
                  </div>
                </div>

                {report.rows.length === 0 ? (
                  <Text className={styles.muted}>
                    No attendance rows are recorded for this date.
                  </Text>
                ) : (
                  <div className={styles.tableWrap}>
                    <Table size="small" aria-label="Attendance rows">
                      <TableHeader>
                        <TableRow>
                          <TableHeaderCell>Member</TableHeaderCell>
                          <TableHeaderCell>Session time</TableHeaderCell>
                          <TableHeaderCell>Source</TableHeaderCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.rows.map((row) => (
                          <TableRow key={`${row.memberNo}:${row.sessionTime ?? ''}`}>
                            <TableCell>
                              <div className={styles.identity}>
                                <Text weight="semibold">{row.name || row.memberNo}</Text>
                                <Text size={200} className={styles.muted}>
                                  {row.memberNo}
                                </Text>
                              </div>
                            </TableCell>
                            <TableCell>
                              {row.sessionTime ? formatTime(row.sessionTime) : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge appearance="outline" size="small">
                                {row.source === 'import' ? 'Import' : 'Manual'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
