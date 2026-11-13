import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
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
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { isUnauthorized } from '../../api/errors';
import { getEvent } from '../../api/events';
import {
  approveRegistrationRequest,
  listRegistrationRequests,
  rejectRegistrationRequest,
  type RegistrationRequest,
} from '../../api/ussd';
import { useSession } from '../../auth/SessionProvider';
import { PageFrame } from '../../components/PageFrame';
import { ReasonDialog } from '../../components/ReasonDialog';
import { useDateTimeFormat } from '../../shell/DateTimeProvider';
import { useUssdStyles } from './ussd-styles';

const MEMBER_NO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

/**
 * USSD → Registrations. Pending anonymous requests list their event, session,
 * name and reference. Approval supplies the immutable member number through the
 * ordinary member create path; rejection requires a reason. Nothing is created
 * before approval.
 */
export function UssdRegistrationsPage() {
  const styles = useUssdStyles();
  const { baseUrl, session, signOut } = useSession();
  const { formatDate, formatInstant } = useDateTimeFormat();
  const queryClient = useQueryClient();
  const token = session?.token ?? '';

  const [approveTarget, setApproveTarget] = useState<RegistrationRequest | null>(null);
  const [memberNo, setMemberNo] = useState('');
  const [memberNoTouched, setMemberNoTouched] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RegistrationRequest | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const requestsQuery = useQuery({
    queryKey: ['ussd', baseUrl, 'registrations', 'pending'],
    queryFn: ({ signal }) =>
      listRegistrationRequests(baseUrl, token, { status: 'pending' }, signal),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (isUnauthorized(requestsQuery.error)) void signOut();
  }, [requestsQuery.error, signOut]);

  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const eventIds = useMemo(
    () => [...new Set(requests.map((request) => request.eventId))],
    [requests],
  );

  const eventQueries = useQueries({
    queries: eventIds.map((eventId) => ({
      queryKey: ['events', baseUrl, 'detail', eventId],
      queryFn: ({ signal }: { signal: AbortSignal }) => getEvent(baseUrl, token, eventId, signal),
      enabled: Boolean(token),
    })),
  });

  const eventNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const query of eventQueries) {
      if (query.data) names.set(query.data.event.id, query.data.event.name);
    }
    return names;
  }, [eventQueries]);

  const approveMutation = useMutation({
    mutationFn: (input: { id: string; memberNo: string }) =>
      approveRegistrationRequest(baseUrl, token, input.id, input.memberNo),
    onSuccess: () => {
      setApproveTarget(null);
      setMemberNo('');
      setMemberNoTouched(false);
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['ussd', baseUrl, 'registrations'] });
      void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
    },
    onError: (error: unknown) => {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setActionError(errorMessage(error));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      rejectRegistrationRequest(baseUrl, token, input.id, input.reason),
    onSuccess: () => {
      setRejectTarget(null);
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['ussd', baseUrl, 'registrations'] });
    },
    onError: (error: unknown) => {
      setRejectTarget(null);
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setActionError(errorMessage(error));
    },
  });

  const memberNoValid = MEMBER_NO_PATTERN.test(memberNo.trim());

  return (
    <PageFrame
      sectionId="ussd"
      title="USSD registrations"
      submenu="Registrations"
      description="Pending handset registration requests. Approval creates the member through the ordinary create path with the member number you supply; rejection needs a reason."
      actions={[
        {
          id: 'refresh',
          label: 'Refresh',
          icon: <ArrowClockwiseRegular />,
          disabled: requestsQuery.isFetching,
          onSelect: () => {
            void requestsQuery.refetch();
          },
        },
      ]}
    >
      <div className={styles.page}>
        {actionError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The registration decision failed</MessageBarTitle>
              {actionError}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        <section className={styles.panel} aria-label="Pending registration requests">
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Pending requests</h2>
            <Badge appearance="tint" color="informative" size="small">
              {requests.length} pending
            </Badge>
          </div>

          {requestsQuery.isPending ? (
            <div className={styles.state}>
              <Spinner label="Loading registration requests…" />
            </div>
          ) : requestsQuery.isError ? (
            <div className={styles.panelBody}>
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>Registration requests could not be loaded</MessageBarTitle>
                  {errorMessage(requestsQuery.error)}
                </MessageBarBody>
              </MessageBar>
            </div>
          ) : requests.length === 0 ? (
            <div className={styles.empty}>
              <Text className={styles.emptyTitle}>No pending requests</Text>
              <Text size={200} className={styles.muted}>
                A handset registration code creates one request here; there is no member until it is
                approved.
              </Text>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <Table className={styles.table} size="small" aria-label="Pending registrations">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Reference</TableHeaderCell>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Event</TableHeaderCell>
                    <TableHeaderCell>Session</TableHeaderCell>
                    <TableHeaderCell>Requested</TableHeaderCell>
                    <TableHeaderCell>Decision</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <Text size={200} className={styles.muted}>
                          {request.reference}
                        </Text>
                      </TableCell>
                      <TableCell>
                        {request.firstName} {request.lastName}
                      </TableCell>
                      <TableCell>{eventNames.get(request.eventId) ?? request.eventId}</TableCell>
                      <TableCell>{formatDate(request.sessionDate)}</TableCell>
                      <TableCell>{formatInstant(request.createdAt)}</TableCell>
                      <TableCell>
                        <div className={styles.badgeRow}>
                          <Button
                            size="small"
                            appearance="primary"
                            onClick={() => {
                              setActionError(null);
                              setMemberNo('');
                              setMemberNoTouched(false);
                              setApproveTarget(request);
                            }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            appearance="secondary"
                            onClick={() => {
                              setActionError(null);
                              setRejectTarget(request);
                            }}
                          >
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

      <Dialog
        open={approveTarget !== null}
        onOpenChange={(_, data) => {
          if (!data.open) {
            setApproveTarget(null);
            setMemberNo('');
            setMemberNoTouched(false);
          }
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Approve the registration</DialogTitle>
            <DialogContent>
              <div className={styles.panelBody}>
                <Text size={200} className={styles.muted}>
                  {approveTarget
                    ? `${approveTarget.firstName} ${approveTarget.lastName} · ${approveTarget.reference}`
                    : ''}
                </Text>
                <Field
                  label="Member number"
                  hint="The member number is immutable on the member record. The API rejects a duplicate."
                  validationState={memberNoTouched && !memberNoValid ? 'error' : 'none'}
                  validationMessage={
                    memberNoTouched && !memberNoValid
                      ? 'Use 1-32 letters, digits, hyphens or underscores, starting with a letter or digit.'
                      : undefined
                  }
                >
                  <Input
                    value={memberNo}
                    autoFocus
                    onChange={(_, data) => {
                      setMemberNo(data.value);
                      setMemberNoTouched(true);
                    }}
                  />
                </Field>
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                disabled={approveMutation.isPending}
                onClick={() => {
                  setApproveTarget(null);
                  setMemberNo('');
                  setMemberNoTouched(false);
                }}
              >
                Cancel
              </Button>
              <Button
                appearance="primary"
                disabled={approveMutation.isPending || !memberNoValid}
                onClick={() => {
                  if (!approveTarget) return;
                  setMemberNoTouched(true);
                  if (!memberNoValid) return;
                  approveMutation.mutate({ id: approveTarget.id, memberNo });
                }}
              >
                {approveMutation.isPending ? 'Approving…' : 'Approve and create member'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <ReasonDialog
        open={rejectTarget !== null}
        title="Reject the registration"
        label="Reason"
        hint="The reason is required and stored with the decision. No member is created."
        confirmLabel="Reject request"
        pending={rejectMutation.isPending}
        onConfirm={(reason) => {
          if (rejectTarget) rejectMutation.mutate({ id: rejectTarget.id, reason });
        }}
        onClose={() => setRejectTarget(null)}
      />
    </PageFrame>
  );
}
