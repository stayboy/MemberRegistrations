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
import { DeleteRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { isUnauthorized } from '../api/errors';
import {
  deleteEventAttendance,
  getEventAttendance,
  type EventAttendanceRow,
  type EventSessionItem,
} from '../api/events';
import { useSession } from '../auth/SessionProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { memberLabelFromName } from '../format/member';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { useEventStyles } from './events-styles';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The attendance report could not be loaded.';
}

/**
 * The session attendance dialog (events FR-10, AC-17; UI FR-31). It renders the
 * API's present/expected/importedRows and rows exactly as returned, and removes
 * a row behind the shared confirmation. The report rows carry the attendance id,
 * so no second lookup is needed. When the report errors it shows the API message
 * and no counts or rows, because the UI must never invent absence records
 * (FR-10).
 *
 * Call site: EventDetailPage only.
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
  const queryClient = useQueryClient();
  const token = credential?.token ?? '';
  const date = session?.date ?? '';

  const [removeTarget, setRemoveTarget] = useState<EventAttendanceRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const attendanceQuery = useQuery({
    queryKey: ['events', baseUrl, 'attendance', eventId, date],
    queryFn: ({ signal }) => getEventAttendance(baseUrl, token, eventId, date, signal),
    enabled: open && session !== null && Boolean(token),
  });

  const removeMutation = useMutation({
    mutationFn: (attendanceId: string) =>
      deleteEventAttendance(baseUrl, token, eventId, attendanceId),
    onSuccess: () => {
      setRemoveTarget(null);
      // The prefix covers this report, the event detail's present/expected column and the list counts.
      void queryClient.invalidateQueries({ queryKey: ['events', baseUrl] });
      void queryClient.invalidateQueries({ queryKey: ['member', baseUrl] });
      void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
    },
    onError: (error: unknown) => {
      setRemoveTarget(null);
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setActionError(errorMessage(error));
    },
  });

  useEffect(() => {
    if (isUnauthorized(attendanceQuery.error)) void signOut();
  }, [attendanceQuery.error, signOut]);

  const report = attendanceQuery.data;

  function close(): void {
    setRemoveTarget(null);
    setActionError(null);
    removeMutation.reset();
    onClose();
  }

  function confirmRemove(): void {
    if (!removeTarget || removeMutation.isPending) return;
    removeMutation.mutate(removeTarget.id);
  }

  return (
    <>
      <Dialog
        open={open && session !== null}
        onOpenChange={(_, data) => {
          if (!data.open) close();
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
                  imported rows from manual entries. Removing a row writes a suppression for an
                  imported row, so a later import cannot bring it back; the UI never implies a hard
                  delete.
                </MessageBarBody>
              </MessageBar>

              {actionError ? (
                <MessageBar intent="error">
                  <MessageBarBody>
                    <MessageBarTitle>The attendance row was not removed</MessageBarTitle>
                    {actionError}
                  </MessageBarBody>
                </MessageBar>
              ) : null}

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
                            <TableHeaderCell>Action</TableHeaderCell>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.rows.map((row) => {
                            const label = memberLabelFromName(
                              row.name || row.memberNo,
                              row.gender,
                              row.age,
                            );
                            return (
                              <TableRow key={row.id}>
                                <TableCell>
                                  <div className={styles.identity}>
                                    <Text weight="semibold">{label}</Text>
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
                                <TableCell>
                                  <Button
                                    size="small"
                                    appearance="subtle"
                                    icon={<DeleteRegular />}
                                    aria-label={`Remove attendance for ${label}`}
                                    onClick={() => {
                                      setActionError(null);
                                      setRemoveTarget(row);
                                    }}
                                  >
                                    Remove
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={close}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <ConfirmDialog
        open={removeTarget !== null}
        title={
          removeTarget
            ? `Remove ${memberLabelFromName(
                removeTarget.name || removeTarget.memberNo,
                removeTarget.gender,
                removeTarget.age,
              )}?`
            : 'Remove attendance row?'
        }
        message="The row disappears from this report. An imported row is suppressed, so a later import of this session cannot resurrect it. This is not a hard delete of the register."
        confirmLabel="Remove row"
        busy={removeMutation.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </>
  );
}
