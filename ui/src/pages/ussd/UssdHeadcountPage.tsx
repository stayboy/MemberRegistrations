import {
  Button,
  Card,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
} from '@fluentui/react-components';
import { AddRegular, ArrowClockwiseRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { isUnauthorized } from '../../api/errors';
import { getEvent, getEventAttendance } from '../../api/events';
import { getHeadcounts, recordHeadcount, type Headcount, type HeadcountMode } from '../../api/ussd';
import { useSession } from '../../auth/SessionProvider';
import {
  EventSessionPicker,
  type EventSessionSelection,
} from '../../components/EventSessionPicker';
import { PageFrame } from '../../components/PageFrame';
import { captureState, captureStateLabel, endActionState } from '../../format/capture';
import {
  emptyHeadcountForm,
  fromDateTimeLocal,
  headcountFormFrom,
  headcountPayload,
  toDateTimeLocal,
  type HeadcountFieldKey,
  type HeadcountFormValues,
} from '../../format/ussd';
import { useDateTimeFormat } from '../../shell/DateTimeProvider';
import { HeadcountDialog } from './HeadcountDialogs';
import { HeadcountReadFirst } from './HeadcountReadFirst';
import { useUssdStyles } from './ussd-styles';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

/**
 * USSD → Headcount. The operator's actual counted attendance for one session:
 * a read-first page with the current observation, the register-derived Roster
 * beside it, and the append-only observation history newest first. Record and
 * Correct are dialogs from the page; a correction keeps the corrected
 * observation's `asOf` and supersedes it without deleting it. The roster is
 * never merged; headcounts are operator-only.
 */
export function UssdHeadcountPage() {
  const styles = useUssdStyles();
  const { baseUrl, session, signOut } = useSession();
  const { formatInstant } = useDateTimeFormat();
  const queryClient = useQueryClient();
  const token = session?.token ?? '';

  const [selection, setSelection] = useState<EventSessionSelection | null>(null);
  const [mode, setMode] = useState<HeadcountMode>('adults');
  const [values, setValues] = useState<HeadcountFormValues>(emptyHeadcountForm);
  const [asOf, setAsOf] = useState(() => toDateTimeLocal(new Date()));
  const [recordOpen, setRecordOpen] = useState(false);
  const [correction, setCorrection] = useState<Headcount | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const headcountsQuery = useQuery({
    queryKey: [
      'ussd',
      baseUrl,
      'headcounts',
      selection?.eventId ?? '',
      selection?.sessionDate ?? '',
    ],
    queryFn: ({ signal }) =>
      getHeadcounts(baseUrl, token, selection!.eventId, selection!.sessionDate, signal),
    enabled: Boolean(token) && selection !== null,
  });

  const rosterQuery = useQuery({
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

  // The detail carries the event timezone and the session's `capture` field;
  // the live/end state is computed from it, never stored.
  const eventQuery = useQuery({
    queryKey: ['event', baseUrl, selection?.eventId ?? ''],
    queryFn: ({ signal }) => getEvent(baseUrl, token, selection!.eventId, signal),
    enabled: Boolean(token) && selection !== null,
  });

  useEffect(() => {
    if (
      isUnauthorized(headcountsQuery.error) ||
      isUnauthorized(rosterQuery.error) ||
      isUnauthorized(eventQuery.error)
    ) {
      void signOut();
    }
  }, [headcountsQuery.error, rosterQuery.error, eventQuery.error, signOut]);

  function resetEntry(): void {
    setMode('adults');
    setValues(emptyHeadcountForm());
    setAsOf(toDateTimeLocal(new Date()));
  }

  function closeDialog(): void {
    setRecordOpen(false);
    setCorrection(null);
    resetEntry();
    setActionError(null);
    setNotice(null);
  }

  function startRecord(): void {
    setCorrection(null);
    resetEntry();
    setActionError(null);
    setNotice(null);
    setRecordOpen(true);
  }

  function startCorrection(row: Headcount): void {
    if (closed) {
      setNotice(null);
      setActionError('This session is closed; a correction is no longer accepted.');
      return;
    }
    setRecordOpen(false);
    setCorrection(row);
    setMode(row.mode);
    setValues(headcountFormFrom(row));
    setActionError(null);
    setNotice(null);
  }

  function resetForSelection(next: EventSessionSelection | null): void {
    setSelection(next);
    closeDialog();
  }

  const page = headcountsQuery.data;
  const current = page?.current ?? null;
  const observations = page?.observations ?? [];
  const roster = rosterQuery.data?.expected;

  const event = eventQuery.data?.event;
  const sessionRow = event?.sessions.find((row) => row.date === selection?.sessionDate);
  const captureSession =
    event && sessionRow
      ? {
          date: sessionRow.date,
          startTime: sessionRow.startTime,
          endTime: sessionRow.endTime,
          timezone: event.timezone,
          status: sessionRow.status,
          capture: sessionRow.capture ?? null,
        }
      : null;
  const state = captureSession ? captureState(captureSession, new Date()) : null;
  const endAction = state ? endActionState(state) : 'hidden';
  const closed = state !== null && (state.kind === 'ended' || state.kind === 'cancelled');

  const recordMutation = useMutation({
    mutationFn: () => {
      if (!selection) throw new Error('Choose an event session first.');
      const parsed = headcountPayload(mode, values);
      if ('error' in parsed) throw new Error(parsed.error);
      return recordHeadcount(baseUrl, token, selection.eventId, {
        sessionDate: selection.sessionDate,
        mode,
        ...parsed.payload,
        ...(correction
          ? { supersedesId: correction.id }
          : { asOf: fromDateTimeLocal(asOf) || undefined }),
      });
    },
    onSuccess: () => {
      setActionError(null);
      setRecordOpen(false);
      setCorrection(null);
      resetEntry();
      setNotice(
        correction
          ? 'Correction saved. The earlier observation stays readable and valid for its asOf.'
          : 'Headcount recorded.',
      );
      void queryClient.invalidateQueries({ queryKey: ['ussd', baseUrl, 'headcounts'] });
    },
    onError: (error: unknown) => {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setNotice(null);
      setActionError(errorMessage(error));
    },
  });

  const endMutation = useMutation({
    mutationFn: () => {
      if (!selection) throw new Error('Choose an event session first.');
      if (!current) {
        throw new Error('Record a headcount first; the end capture carries the final count.');
      }
      // The shared close is a capture: a new observation with the same counts
      // and `ended: true`. It supersedes nothing and keeps the count readable.
      return recordHeadcount(baseUrl, token, selection.eventId, {
        sessionDate: selection.sessionDate,
        mode: current.mode,
        adultMale: current.adultMale,
        adultFemale: current.adultFemale,
        adultUnspecified: current.adultUnspecified,
        childMale: current.childMale,
        childFemale: current.childFemale,
        childUnspecified: current.childUnspecified,
        ended: true,
      });
    },
    onSuccess: () => {
      setActionError(null);
      setNotice('Session ended. No further headcounts or per-member captures are accepted.');
      void queryClient.invalidateQueries({ queryKey: ['ussd', baseUrl, 'headcounts'] });
      void queryClient.invalidateQueries({ queryKey: ['event', baseUrl] });
      void queryClient.invalidateQueries({ queryKey: ['events', baseUrl] });
    },
    onError: (error: unknown) => {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setNotice(null);
      setActionError(errorMessage(error));
    },
  });

  const parsedTotal = headcountPayload(mode, values);
  const liveTotal =
    'error' in parsedTotal
      ? 0
      : Object.values(parsedTotal.payload).reduce((sum, value) => sum + value, 0);

  function submitHeadcount(): void {
    if ('error' in parsedTotal) {
      setActionError(parsedTotal.error);
      return;
    }
    recordMutation.mutate();
  }

  return (
    <PageFrame
      sectionId="ussd"
      title="USSD headcount"
      submenu="Headcount"
      description="The counted attendance for one session. Every entry is an append-only observation with an asOf; a correction supersedes the current row without deleting it. The register-derived roster is shown separately and is never merged."
      actions={[
        {
          id: 'record-headcount',
          label: 'Record headcount',
          icon: <AddRegular />,
          disabled: !selection || recordMutation.isPending || closed,
          onSelect: startRecord,
        },
        {
          id: 'refresh',
          label: 'Refresh',
          icon: <ArrowClockwiseRegular />,
          disabled: !selection || headcountsQuery.isFetching,
          onSelect: () => {
            void headcountsQuery.refetch();
            void rosterQuery.refetch();
          },
        },
      ]}
    >
      <div className={styles.page}>
        <Card className={styles.panel}>
          <div className={styles.panelBody}>
            <EventSessionPicker value={selection} onChange={resetForSelection} />
          </div>
        </Card>

        {selection && state && event ? (
          <Card className={styles.panel}>
            <div className={styles.panelBody}>
              <div className={styles.captureState}>
                <div className={styles.captureLabel}>
                  {state.kind === 'live' ? (
                    <span className={styles.captureDot} aria-hidden="true" />
                  ) : null}
                  <Text weight="semibold">{captureStateLabel(state, event.timezone)}</Text>
                </div>
                <div className={styles.badgeRow}>
                  {endAction !== 'hidden' ? (
                    <Button
                      appearance="primary"
                      disabled={endAction === 'disabled' || endMutation.isPending}
                      onClick={() => endMutation.mutate()}
                    >
                      End of session
                    </Button>
                  ) : null}
                </div>
              </div>
              <Text size={200} className={styles.muted}>
                {state.kind === 'ended'
                  ? 'This session is closed; no further headcounts or per-member captures. The line is derived from the latest capture’s as-of time and its end flag.'
                  : state.kind === 'cancelled'
                    ? 'A cancelled session is read-only.'
                    : 'Live is computed from the session date and its start/end window in the event timezone. End of session closes the session for per-member attendance and headcounts.'}
              </Text>
            </div>
          </Card>
        ) : null}

        {actionError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The headcount could not be recorded</MessageBarTitle>
              {actionError}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {notice ? (
          <MessageBar intent="success">
            <MessageBarBody>{notice}</MessageBarBody>
          </MessageBar>
        ) : null}

        {!selection ? (
          <div className={styles.empty}>
            <Text className={styles.emptyTitle}>No session selected</Text>
            <Text size={200} className={styles.muted}>
              Choose an event session above to record or correct its headcount.
            </Text>
          </div>
        ) : headcountsQuery.isPending ? (
          <div className={styles.state}>
            <Spinner label="Loading headcounts…" />
          </div>
        ) : headcountsQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Headcounts could not be loaded</MessageBarTitle>
              {errorMessage(headcountsQuery.error)}
            </MessageBarBody>
          </MessageBar>
        ) : (
          <HeadcountReadFirst
            current={current}
            observations={observations}
            roster={roster}
            rosterPending={rosterQuery.isPending}
            rosterError={rosterQuery.isError}
            pending={recordMutation.isPending}
            formatInstant={formatInstant}
            onCorrect={startCorrection}
          />
        )}
      </div>

      <HeadcountDialog
        open={recordOpen || correction !== null}
        correction={correction}
        mode={mode}
        values={values}
        asOf={asOf}
        total={liveTotal}
        submitError={actionError}
        validationError={'error' in parsedTotal ? parsedTotal.error : null}
        pending={recordMutation.isPending}
        formatInstant={formatInstant}
        onModeChange={(next) => {
          setMode(next);
          setValues(emptyHeadcountForm());
        }}
        onValueChange={(key: HeadcountFieldKey, value: string) =>
          setValues((currentValues) => ({ ...currentValues, [key]: value }))
        }
        onAsOfChange={setAsOf}
        onSubmit={submitHeadcount}
        onClose={closeDialog}
      />
    </PageFrame>
  );
}
