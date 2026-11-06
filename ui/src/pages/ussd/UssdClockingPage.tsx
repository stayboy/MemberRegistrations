import {
  Badge,
  Button,
  Card,
  Field,
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
  Textarea,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular, PersonAddRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { isUnauthorized } from '../../api/errors';
import { addEventAttendance, getEventAttendance } from '../../api/events';
import { listDelegations, recordDelegation } from '../../api/ussd';
import { useSession } from '../../auth/SessionProvider';
import {
  EventSessionPicker,
  type EventSessionSelection,
} from '../../components/EventSessionPicker';
import { MemberPicker } from '../../components/MemberPicker';
import { PageFrame } from '../../components/PageFrame';
import { memberLabelFromName } from '../../format/member';
import { useDateTimeFormat } from '../../shell/DateTimeProvider';
import { useUssdStyles } from './ussd-styles';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

/**
 * USSD → Clocking. Shows the session's present rows and active delegations,
 * records a manual clock-in for a member, and records a senior presbyter's
 * delegation to another presbyter for this one session. The API owns the
 * presbyter/senior rules; the screen shows its problem message verbatim.
 */
export function UssdClockingPage() {
  const styles = useUssdStyles();
  const { baseUrl, session, signOut } = useSession();
  const { formatDate, formatTime, formatInstant } = useDateTimeFormat();
  const queryClient = useQueryClient();
  const token = session?.token ?? '';

  const [selection, setSelection] = useState<EventSessionSelection | null>(null);
  const [clockInMemberNo, setClockInMemberNo] = useState<string | null>(null);
  const [fromMemberNo, setFromMemberNo] = useState<string | null>(null);
  const [toMemberNo, setToMemberNo] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const attendanceQuery = useQuery({
    queryKey: [
      'events',
      baseUrl,
      'attendance',
      selection?.eventId ?? '',
      selection?.sessionDate ?? '',
    ],
    queryFn: ({ signal }) =>
      getEventAttendance(baseUrl, token, selection!.eventId, selection!.sessionDate, signal),
    enabled: Boolean(token) && selection !== null,
  });

  const delegationsQuery = useQuery({
    queryKey: [
      'ussd',
      baseUrl,
      'delegations',
      selection?.eventId ?? '',
      selection?.sessionDate ?? '',
    ],
    queryFn: ({ signal }) =>
      listDelegations(baseUrl, token, selection!.eventId, selection!.sessionDate, signal),
    enabled: Boolean(token) && selection !== null,
  });

  useEffect(() => {
    if (isUnauthorized(attendanceQuery.error) || isUnauthorized(delegationsQuery.error)) {
      void signOut();
    }
  }, [attendanceQuery.error, delegationsQuery.error, signOut]);

  const clockInMutation = useMutation({
    mutationFn: (memberNo: string) => {
      if (!selection) throw new Error('Choose an event session first.');
      return addEventAttendance(baseUrl, token, selection.eventId, {
        memberNo,
        date: selection.sessionDate,
      });
    },
    onSuccess: () => {
      setClockInMemberNo(null);
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['events', baseUrl, 'attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['events', baseUrl] });
    },
    onError: (error: unknown) => {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setActionError(errorMessage(error));
    },
  });

  const delegationMutation = useMutation({
    mutationFn: () => {
      if (!selection || !fromMemberNo || !toMemberNo) {
        throw new Error('Choose both presbyters first.');
      }
      return recordDelegation(baseUrl, token, selection.eventId, selection.sessionDate, {
        fromMemberNo,
        toMemberNo,
        reason: reason.trim(),
      });
    },
    onSuccess: () => {
      setFromMemberNo(null);
      setToMemberNo(null);
      setReason('');
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['ussd', baseUrl, 'delegations'] });
    },
    onError: (error: unknown) => {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setActionError(errorMessage(error));
    },
  });

  const report = attendanceQuery.data;
  const delegations = delegationsQuery.data ?? [];

  return (
    <PageFrame
      sectionId="ussd"
      title="USSD clocking"
      submenu="Clocking"
      description="Session attendance, manual clock-ins and one-session presbyter delegations. A delegate inherits the senior's broad clocking authority for this session only."
      actions={
        <Button
          icon={<ArrowClockwiseRegular />}
          disabled={!selection || attendanceQuery.isFetching}
          onClick={() => {
            void attendanceQuery.refetch();
            void delegationsQuery.refetch();
          }}
        >
          Refresh
        </Button>
      }
    >
      <div className={styles.page}>
        <Card className={styles.panel}>
          <div className={styles.panelBody}>
            <EventSessionPicker
              value={selection}
              onChange={(next) => {
                setSelection(next);
                setActionError(null);
              }}
            />
          </div>
        </Card>

        {actionError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The clocking action failed</MessageBarTitle>
              {actionError}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        <section className={styles.panel} aria-label="Session attendance">
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Attendance</h2>
            {report ? (
              <div className={styles.badgeRow}>
                <Badge appearance="tint" color="success" size="small">
                  {report.present} present
                </Badge>
                <Badge appearance="tint" color="informative" size="small">
                  {report.expected} roster
                </Badge>
              </div>
            ) : null}
          </div>

          {!selection ? (
            <div className={styles.empty}>
              <Text className={styles.emptyTitle}>No session selected</Text>
              <Text size={200} className={styles.muted}>
                Choose an event session above to review attendance and clock members in.
              </Text>
            </div>
          ) : attendanceQuery.isPending ? (
            <div className={styles.state}>
              <Spinner label="Loading attendance…" />
            </div>
          ) : attendanceQuery.isError ? (
            <div className={styles.panelBody}>
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>Attendance could not be loaded</MessageBarTitle>
                  {errorMessage(attendanceQuery.error)}
                </MessageBarBody>
              </MessageBar>
            </div>
          ) : (
            <>
              <div className={styles.panelBody}>
                <div className={styles.toolbar}>
                  <div className={styles.field}>
                    <MemberPicker
                      value={clockInMemberNo}
                      onChange={setClockInMemberNo}
                      label="Record a clock-in"
                      disabled={clockInMutation.isPending}
                    />
                  </div>
                  <Button
                    icon={<PersonAddRegular />}
                    appearance="primary"
                    disabled={!clockInMemberNo || clockInMutation.isPending}
                    onClick={() => {
                      if (clockInMemberNo) clockInMutation.mutate(clockInMemberNo);
                    }}
                  >
                    {clockInMutation.isPending ? 'Recording…' : 'Record clock-in'}
                  </Button>
                </div>
                <Text size={200} className={styles.muted}>
                  Clock-ins are manual attendance rows. They never change the register-derived
                  roster and are not a headcount.
                </Text>
              </div>

              {(report?.rows ?? []).length === 0 ? (
                <div className={styles.empty}>
                  <Text className={styles.emptyTitle}>No attendance recorded</Text>
                  <Text size={200} className={styles.muted}>
                    Clock a member in, or import the attendance registry for this session.
                  </Text>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <Table className={styles.table} size="small" aria-label="Session attendance">
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Member</TableHeaderCell>
                        <TableHeaderCell>Time</TableHeaderCell>
                        <TableHeaderCell>Source</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(report?.rows ?? []).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            {memberLabelFromName(row.name, row.gender, row.age)}{' '}
                            <Text size={200} className={styles.muted}>
                              {row.memberNo}
                            </Text>
                          </TableCell>
                          <TableCell>
                            {row.sessionTime ? formatTime(row.sessionTime) : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge appearance="tint" color="subtle" size="small">
                              {row.source}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </section>

        <section className={styles.panel} aria-label="Session delegations">
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Delegations</h2>
          </div>

          {!selection ? (
            <div className={styles.empty}>
              <Text size={200} className={styles.muted}>
                Choose a session to record a delegation.
              </Text>
            </div>
          ) : (
            <>
              <div className={styles.panelBody}>
                <div className={styles.fields}>
                  <div className={styles.field}>
                    <MemberPicker
                      value={fromMemberNo}
                      onChange={setFromMemberNo}
                      label="Senior presbyter"
                      disabled={delegationMutation.isPending}
                    />
                  </div>
                  <div className={styles.field}>
                    <MemberPicker
                      value={toMemberNo}
                      onChange={setToMemberNo}
                      label="Delegating to"
                      excludeMemberNo={fromMemberNo ?? undefined}
                      disabled={delegationMutation.isPending}
                    />
                  </div>
                </div>
                <Field
                  label="Reason"
                  hint="Required, 3-500 characters, stored with the delegation."
                >
                  <Textarea
                    value={reason}
                    maxLength={500}
                    resize="vertical"
                    onChange={(_, data) => setReason(data.value)}
                  />
                </Field>
                <div>
                  <Button
                    appearance="primary"
                    disabled={
                      !fromMemberNo ||
                      !toMemberNo ||
                      reason.trim().length < 3 ||
                      delegationMutation.isPending
                    }
                    onClick={() => delegationMutation.mutate()}
                  >
                    {delegationMutation.isPending ? 'Recording…' : 'Record delegation'}
                  </Button>
                </div>
              </div>

              {delegationsQuery.isPending ? (
                <div className={styles.state}>
                  <Spinner label="Loading delegations…" />
                </div>
              ) : delegations.length === 0 ? (
                <div className={styles.empty}>
                  <Text size={200} className={styles.muted}>
                    No active delegation for this session.
                  </Text>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <Table className={styles.table} size="small" aria-label="Session delegations">
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>From</TableHeaderCell>
                        <TableHeaderCell>To</TableHeaderCell>
                        <TableHeaderCell>Reason</TableHeaderCell>
                        <TableHeaderCell>Recorded</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {delegations.map((delegation) => (
                        <TableRow key={delegation.id}>
                          <TableCell>
                            {delegation.fromName}{' '}
                            <Text size={200} className={styles.muted}>
                              {delegation.fromMemberNo}
                            </Text>
                          </TableCell>
                          <TableCell>
                            {delegation.toName}{' '}
                            <Text size={200} className={styles.muted}>
                              {delegation.toMemberNo}
                            </Text>
                          </TableCell>
                          <TableCell>{delegation.reason}</TableCell>
                          <TableCell>{formatInstant(delegation.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </section>

        {selection ? (
          <Text size={200} className={styles.muted}>
            Session {formatDate(selection.sessionDate)}. A delegation is one active row per session;
            it ends with the session.
          </Text>
        ) : null}
      </div>
    </PageFrame>
  );
}
