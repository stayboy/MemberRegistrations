import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import { getHeadcounts, recordHeadcount, type Headcount, type HeadcountPage } from '../api/ussd';
import { isUnauthorized } from '../api/errors';
import { useSession } from '../auth/SessionProvider';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { HeadcountDialog } from '../pages/ussd/HeadcountDialogs';
import {
  HEADCOUNT_MODE_OPTIONS,
  emptyHeadcountForm,
  fromDateTimeLocal,
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
function laneRows(page: HeadcountPage | undefined): readonly { mode: string; label: string; row: Headcount }[] {
  const current = page?.current ?? {};
  const rows: { mode: string; label: string; row: Headcount }[] = [];
  for (const [mode, row] of Object.entries(current)) {
    if (!row) continue;
    const label = mode === 'mixed' ? 'Mixed (retired)' : (LANE_LABELS.get(mode as HeadcountEntryMode) ?? mode);
    rows.push({ mode, label, row });
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
  eventId,
  sessionDate,
  disabled = false,
}: {
  eventId: string;
  sessionDate: string;
  disabled?: boolean;
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
        // The API takes an offset-bearing instant; the control holds a local wall clock.
        asOf: fromDateTimeLocal(asOf),
      } as Parameters<typeof recordHeadcount>[3]);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['headcounts', baseUrl, eventId, sessionDate],
      });
      setOpen(false);
      setError(null);
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

  const rows = laneRows(query.data);

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
          </div>
        ))
      )}

      <Button
        size="small"
        appearance="transparent"
        disabled={disabled}
        onClick={() => {
          setError(null);
          resetForm();
          setOpen(true);
        }}
      >
        Record headcount
      </Button>

      <HeadcountDialog
        open={open}
        correction={null}
        mode={mode}
        values={values}
        asOf={asOf}
        total={0}
        submitError={error}
        validationError={null}
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
          resetForm();
        }}
      />
    </div>
  );
}
