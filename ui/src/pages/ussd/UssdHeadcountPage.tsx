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
import { getEventAttendance } from '../../api/events';
import { getHeadcounts, recordHeadcount, type Headcount, type HeadcountMode } from '../../api/ussd';
import { useSession } from '../../auth/SessionProvider';
import {
  EventSessionPicker,
  type EventSessionSelection,
} from '../../components/EventSessionPicker';
import { PageFrame } from '../../components/PageFrame';
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

  useEffect(() => {
    if (isUnauthorized(headcountsQuery.error) || isUnauthorized(rosterQuery.error)) {
      void signOut();
    }
  }, [headcountsQuery.error, rosterQuery.error, signOut]);

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

  const page = headcountsQuery.data;
  const current = page?.current ?? null;
  const observations = page?.observations ?? [];
  const roster = rosterQuery.data?.expected;

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
      actions={
        <>
          <Button
            icon={<AddRegular />}
            appearance="primary"
            disabled={!selection || recordMutation.isPending}
            onClick={startRecord}
          >
            Record headcount
          </Button>
          <Button
            icon={<ArrowClockwiseRegular />}
            disabled={!selection || headcountsQuery.isFetching}
            onClick={() => {
              void headcountsQuery.refetch();
              void rosterQuery.refetch();
            }}
          >
            Refresh
          </Button>
        </>
      }
    >
      <div className={styles.page}>
        <Card className={styles.panel}>
          <div className={styles.panelBody}>
            <EventSessionPicker value={selection} onChange={resetForSelection} />
          </div>
        </Card>

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
