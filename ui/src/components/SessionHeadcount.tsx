import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import { getHeadcounts, recordHeadcount, type Headcount, type HeadcountPage } from '../api/ussd';
import { postAttendanceImport } from '../api/imports';
import { isUnauthorized } from '../api/errors';
import { useSession } from '../auth/SessionProvider';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { HeadcountDialog } from './HeadcountDialog';
import {
  HEADCOUNT_MODE_OPTIONS,
  emptyHeadcountForm,
  fromDateTimeLocal,
  headcountFormFrom,
  headcountPayload,
  toDateTimeLocal,
  type HeadcountEntryMode,
  type HeadcountFieldKey,
  type HeadcountFormValues,
} from '../format/ussd';

const useStyles = makeStyles({
  cell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    alignItems: 'flex-start',
  },
  actions: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  },
  lane: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0px',
  },
  muted: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
});

const LANE_LABELS = new Map(HEADCOUNT_MODE_OPTIONS.map((option) => [option.value, option.label]));

/**
 * One line per lane, each with its own buckets (HC-22: no read sums lanes, so there is no single
 * figure here; HC-28: a lane shows its buckets, not only its total). A legacy `mixed` observation is
 * named as retired rather than read as a live lane (HC-9).
 */
function laneRows(
  page: HeadcountPage | undefined,
): readonly { mode: string; label: string; row: Headcount; correctable: boolean }[] {
  const current = page?.current ?? {};
  const rows: { mode: string; label: string; row: Headcount; correctable: boolean }[] = [];
  for (const [mode, row] of Object.entries(current)) {
    if (!row) continue;
    const label = mode === 'mixed' ? 'Mixed (retired)' : (LANE_LABELS.get(mode as HeadcountEntryMode) ?? mode);
    // A legacy `mixed` observation is history: it is shown, never superseded (HC-9).
    rows.push({ mode, label, row, correctable: mode !== 'mixed' });
  }
  return rows;
}

function bucketLine(row: Headcount): string {
  if (row.lines.length === 0) return `${row.total}`;
  return row.lines.map((line) => `${line.label} ${line.count}`).join(' · ');
}

/**
 * The headcount a session carries, and the action that records it (owner, 2026-11-15).
 *
 * A count is per session and needs its activity, which is why this lives on the session row rather than
 * on a page of its own. The read is per session - the API's headcount route is session-scoped - so a
 * detail page issues one bounded read for each session it renders.
 */
export function SessionHeadcount({
  endAction = 'hidden',
  onImport,
  eventId,
  sessionDate,
  disabled = false,
}: {
  eventId: string;
  sessionDate: string;
  disabled?: boolean;
  /**
   * The End of session control's state (FR-6f/AC-7a): offered only while live, shown disabled once
   * closed, and absent for a session that has not started or whose window has passed.
   */
  endAction?: 'enabled' | 'disabled' | 'hidden';
  /** Opens the attendance import for this session; absent when the event offers none (FR-8). */
  onImport?: () => void;
}) {
  const styles = useStyles();
  const { baseUrl, session, signOut } = useSession();
  const { formatInstant } = useDateTimeFormat();
  const queryClient = useQueryClient();
  const token = session?.token ?? '';

  const query = useQuery({
    queryKey: ['headcounts', baseUrl, eventId, sessionDate],
    queryFn: ({ signal }) => getHeadcounts(baseUrl, token, eventId, sessionDate, signal),
    enabled: Boolean(token) && Boolean(eventId) && Boolean(sessionDate),
    retry: false,
  });

  useEffect(() => {
    if (isUnauthorized(query.error)) signOut();
  }, [query.error, signOut]);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<HeadcountEntryMode>('adults');
  const [values, setValues] = useState<HeadcountFormValues>(emptyHeadcountForm);
  const [asOf, setAsOf] = useState(() => toDateTimeLocal(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [correction, setCorrection] = useState<Headcount | null>(null);
  const [endError, setEndError] = useState<string | null>(null);

  /**
   * Open the dialog for a new count, or for a correction of one lane's observation. A correction keeps
   * the observation's own asOf - the moment counted - and supersedes it without deleting it (HC-3).
   */
  const openFor = (row: Headcount | null) => {
    setError(null);
    if (row) {
      setCorrection(row);
      setMode(row.mode === 'mixed' ? 'adults' : (row.mode as HeadcountEntryMode));
      setValues(headcountFormFrom(row));
      setAsOf(toDateTimeLocal(new Date(row.asOf)));
    } else {
      setCorrection(null);
      resetForm();
    }
    setOpen(true);
  };

  const resetForm = () => {
    setValues(emptyHeadcountForm());
    setAsOf(toDateTimeLocal(new Date()));
    setMode('adults');
  };

  const mutation = useMutation({
    mutationFn: () => {
      const parsed = headcountPayload(mode, values);
      if ('error' in parsed) throw new Error(parsed.error);
      return recordHeadcount(baseUrl, token, eventId, {
        sessionDate,
        mode,
        ...parsed.payload,
        // A correction supersedes the observation it corrects and keeps that observation's asOf; a new
        // count takes the instant the control holds, converted from the local wall clock to the
        // offset-bearing form the API requires.
        ...(correction
          ? { supersedesId: correction.id }
          : { asOf: fromDateTimeLocal(asOf) || undefined }),
      } as Parameters<typeof recordHeadcount>[3]);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['headcounts', baseUrl, eventId, sessionDate],
      });
      setOpen(false);
      setError(null);
      setCorrection(null);
      resetForm();
    },
    onError: (failure: unknown) => {
      if (isUnauthorized(failure)) {
        signOut();
        return;
      }
      setError(failure instanceof Error ? failure.message : 'The count could not be recorded.');
    },
  });

  /**
   * The shared close: one capture per event and session, sent as an end-only import (rows: []). It is
   * the same request the retired operator page made, so the API sees no difference.
   */
  const endMutation = useMutation({
    mutationFn: () =>
      postAttendanceImport(baseUrl, token, { eventId, sessionDate, rows: [], ended: true }),
    onSuccess: () => {
      setEndError(null);
      void queryClient.invalidateQueries({ queryKey: ['headcounts', baseUrl, eventId, sessionDate] });
      void queryClient.invalidateQueries({ queryKey: ['events', baseUrl, 'detail', eventId] });
    },
    onError: (failure: unknown) => {
      if (isUnauthorized(failure)) {
        signOut();
        return;
      }
      setEndError(failure instanceof Error ? failure.message : 'The session could not be ended.');
    },
  });

  const rows = laneRows(query.data);
  const liveTotal = Object.values(values).reduce(
    (sum, value) => sum + (Number.parseInt(value, 10) || 0),
    0,
  );
  const parsedPayload = headcountPayload(mode, values);
  const validationError = 'error' in parsedPayload ? parsedPayload.error : null;

  return (
    <div className={styles.cell}>
      {query.isError ? (
        <MessageBar intent="warning">
          <MessageBarBody>
            <Text size={200}>The count could not be read.</Text>
            <Button size="small" appearance="transparent" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </MessageBarBody>
        </MessageBar>
      ) : query.isPending ? (
        <Text size={200} className={styles.muted}>
          …
        </Text>
      ) : rows.length === 0 ? (
        <Text size={200} className={styles.muted}>
          Not counted
        </Text>
      ) : (
        rows.map((lane) => (
          <div key={lane.mode} className={styles.lane}>
            <Text size={200} weight="semibold">
              {lane.label}
            </Text>
            <Text size={100} className={styles.muted}>
              {bucketLine(lane.row)}
            </Text>
            {lane.correctable ? (
              <Button
                size="small"
                appearance="transparent"
                disabled={disabled}
                onClick={() => openFor(lane.row)}
              >
                Correct
              </Button>
            ) : null}
          </div>
        ))
      )}

      <div className={styles.actions}>
        <Button
          size="small"
          appearance="transparent"
          disabled={disabled}
          onClick={() => openFor(null)}
        >
          Record headcount
        </Button>
        {onImport ? (
          <Button size="small" appearance="transparent" disabled={disabled} onClick={onImport}>
            Import
          </Button>
        ) : null}
        {endAction !== 'hidden' ? (
          <Button
            size="small"
            appearance="transparent"
            disabled={disabled || endAction === 'disabled' || endMutation.isPending}
            onClick={() => {
              setEndError(null);
              endMutation.mutate();
            }}
          >
            End of session
          </Button>
        ) : null}
      </div>
      {endError !== null ? (
        <Text size={200} role="alert" className={styles.muted}>
          The session could not be ended: {endError}
        </Text>
      ) : null}

      <HeadcountDialog
        open={open}
        correction={correction}
        mode={mode}
        values={values}
        asOf={asOf}
        total={liveTotal}
        submitError={error}
        validationError={validationError}
        pending={mutation.isPending}
        formatInstant={formatInstant}
        onModeChange={(next) => {
          setMode(next);
          setValues(emptyHeadcountForm());
        }}
        onValueChange={(key: HeadcountFieldKey, value: string) =>
          setValues((current) => ({ ...current, [key]: value }))
        }
        onAsOfChange={setAsOf}
        onSubmit={() => mutation.mutate()}
        onClose={() => {
          setOpen(false);
          setError(null);
          setCorrection(null);
          resetForm();
        }}
      />
    </div>
  );
}
