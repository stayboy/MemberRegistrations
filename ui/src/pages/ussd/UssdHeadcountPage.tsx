import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Radio,
  RadioGroup,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular, EditRegular } from '@fluentui/react-icons';
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
  HEADCOUNT_MODE_OPTIONS,
  emptyHeadcountForm,
  fromDateTimeLocal,
  headcountFields,
  headcountFormFrom,
  headcountModeLabel,
  headcountPayload,
  toDateTimeLocal,
  type HeadcountFormValues,
} from '../../format/ussd';
import { useDateTimeFormat } from '../../shell/DateTimeProvider';
import { useUssdStyles } from './ussd-styles';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function bucketSummary(row: Headcount): string {
  const parts: string[] = [];
  if (row.adultMale) parts.push(`AM ${row.adultMale}`);
  if (row.adultFemale) parts.push(`AF ${row.adultFemale}`);
  if (row.adultUnspecified) parts.push(`A? ${row.adultUnspecified}`);
  if (row.childMale) parts.push(`CM ${row.childMale}`);
  if (row.childFemale) parts.push(`CF ${row.childFemale}`);
  if (row.childUnspecified) parts.push(`C? ${row.childUnspecified}`);
  return parts.length === 0 ? 'All zero' : parts.join(' · ');
}

/**
 * USSD → Headcount. The operator's actual counted attendance for one session:
 * a mode selector, an `asOf` defaulting to now, the three-number entry (four in
 * Mixed), the append-only observation history newest first, and a Correct action
 * that keeps the corrected observation's `asOf` and supersedes it without
 * deleting it. The register-derived `expected` is shown alongside as Roster and
 * is never merged; headcounts are operator-only.
 */
export function UssdHeadcountPage() {
  const styles = useUssdStyles();
  const { baseUrl, session, signOut } = useSession();
  const { formatDate, formatInstant } = useDateTimeFormat();
  const queryClient = useQueryClient();
  const token = session?.token ?? '';

  const [selection, setSelection] = useState<EventSessionSelection | null>(null);
  const [mode, setMode] = useState<HeadcountMode>('adults');
  const [values, setValues] = useState<HeadcountFormValues>(emptyHeadcountForm);
  const [asOf, setAsOf] = useState(() => toDateTimeLocal(new Date()));
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
      setNotice(
        correction
          ? 'Correction saved. The earlier observation stays readable and valid for its asOf.'
          : 'Headcount recorded.',
      );
      setCorrection(null);
      setValues(emptyHeadcountForm());
      setAsOf(toDateTimeLocal(new Date()));
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

  function startCorrection(row: Headcount): void {
    setCorrection(row);
    setMode(row.mode);
    setValues(headcountFormFrom(row));
    setActionError(null);
    setNotice(null);
  }

  function cancelCorrection(): void {
    setCorrection(null);
    setMode('adults');
    setValues(emptyHeadcountForm());
    setAsOf(toDateTimeLocal(new Date()));
    setActionError(null);
  }

  const fields = headcountFields(mode);
  const parsedTotal = headcountPayload(mode, values);

  return (
    <PageFrame
      sectionId="ussd"
      title="USSD headcount"
      submenu="Headcount"
      description="The counted attendance for one session. Every entry is an append-only observation with an asOf; a correction supersedes the current row without deleting it. The register-derived roster is shown separately and is never merged."
      actions={
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
      }
    >
      <div className={styles.page}>
        <Card className={styles.panel}>
          <div className={styles.panelBody}>
            <EventSessionPicker
              value={selection}
              onChange={(next) => {
                setSelection(next);
                setCorrection(null);
                setValues(emptyHeadcountForm());
                setActionError(null);
                setNotice(null);
              }}
            />
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
          <>
            <div className={styles.fields}>
              <Card className={styles.panel} style={{ flex: 1, minWidth: '260px' }}>
                <div className={styles.panelBody}>
                  <Text size={200} className={styles.muted}>
                    Current headcount
                  </Text>
                  {current ? (
                    <>
                      <Text className={styles.code}>{current.total}</Text>
                      <div className={styles.badgeRow}>
                        <Badge appearance="tint" color="brand" size="small">
                          {headcountModeLabel(current.mode)}
                        </Badge>
                        <Text size={200}>as of {formatInstant(current.asOf)}</Text>
                      </div>
                      <Text size={200} className={styles.muted}>
                        {bucketSummary(current)} · recorded {formatInstant(current.recordedAt)}
                      </Text>
                      <div>
                        <Button
                          size="small"
                          icon={<EditRegular />}
                          onClick={() => startCorrection(current)}
                          disabled={recordMutation.isPending}
                        >
                          Correct
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Text size={200} className={styles.muted}>
                      No headcount recorded for this session yet.
                    </Text>
                  )}
                </div>
              </Card>

              <Card className={styles.panel} style={{ flex: 1, minWidth: '260px' }}>
                <div className={styles.panelBody}>
                  <Text size={200} className={styles.muted}>
                    Roster
                  </Text>
                  {rosterQuery.isPending ? (
                    <Spinner size="tiny" label="Loading the roster…" />
                  ) : rosterQuery.isError ? (
                    <Text size={200} className={styles.muted}>
                      The register-derived roster could not be read.
                    </Text>
                  ) : (
                    <>
                      <Text className={styles.code}>{roster ?? 0}</Text>
                      <Text size={200} className={styles.muted}>
                        Register-derived expected attendance. Never merged with the headcount.
                      </Text>
                    </>
                  )}
                </div>
              </Card>
            </div>

            <section className={styles.panel} aria-label="Record a headcount">
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>
                  {correction ? 'Correct the current observation' : 'Record a headcount'}
                </h2>
                {correction ? (
                  <Badge appearance="tint" color="warning" size="small">
                    Keeping asOf {formatInstant(correction.asOf)}
                  </Badge>
                ) : null}
              </div>
              <div className={styles.panelBody}>
                <Field label="Mode">
                  <RadioGroup
                    value={mode}
                    disabled={recordMutation.isPending}
                    onChange={(_, data) => {
                      setMode(data.value as HeadcountMode);
                      setValues(emptyHeadcountForm());
                    }}
                  >
                    {HEADCOUNT_MODE_OPTIONS.map((option) => (
                      <Radio key={option.value} value={option.value} label={option.label} />
                    ))}
                  </RadioGroup>
                </Field>

                {correction ? (
                  <Text size={200} className={styles.muted}>
                    The correction keeps {formatInstant(correction.asOf)} — the moment counted — and
                    supersedes the current observation without deleting it. The mode and numbers
                    stay editable; the earlier row remains valid for its asOf.
                  </Text>
                ) : (
                  <Field
                    label="As of"
                    hint="Defaults to now and must fall within the session day in the event timezone."
                  >
                    <Input
                      type="datetime-local"
                      value={asOf}
                      onChange={(_, data) => setAsOf(data.value)}
                    />
                  </Field>
                )}

                <div className={styles.fields}>
                  {fields.map((field) => (
                    <Field key={field.key} label={field.label} className={styles.narrowField}>
                      <Input
                        type="number"
                        min={0}
                        max={10_000}
                        value={values[field.key]}
                        disabled={recordMutation.isPending}
                        onChange={(_, data) =>
                          setValues((currentValues) => ({
                            ...currentValues,
                            [field.key]: data.value,
                          }))
                        }
                      />
                    </Field>
                  ))}
                </div>

                <div className={styles.badgeRow}>
                  <Button
                    appearance="primary"
                    disabled={recordMutation.isPending || 'error' in parsedTotal}
                    onClick={() => recordMutation.mutate()}
                  >
                    {recordMutation.isPending
                      ? 'Saving…'
                      : correction
                        ? 'Save correction'
                        : 'Record headcount'}
                  </Button>
                  {correction ? (
                    <Button
                      appearance="secondary"
                      disabled={recordMutation.isPending}
                      onClick={cancelCorrection}
                    >
                      Cancel correction
                    </Button>
                  ) : null}
                  {'error' in parsedTotal ? (
                    <Text size={200} role="alert">
                      {parsedTotal.error}
                    </Text>
                  ) : (
                    <Text size={200} className={styles.muted}>
                      Total{' '}
                      {Object.values(parsedTotal.payload).reduce((sum, value) => sum + value, 0)}
                    </Text>
                  )}
                </div>
              </div>
            </section>

            <section className={styles.panel} aria-label="Headcount observations">
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Observation history</h2>
                <Text size={200} className={styles.muted}>
                  Newest first · superseded rows stay readable
                </Text>
              </div>
              {observations.length === 0 ? (
                <div className={styles.empty}>
                  <Text size={200} className={styles.muted}>
                    No observation for this session yet.
                  </Text>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <Table className={styles.table} size="small" aria-label="Headcount observations">
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>As of</TableHeaderCell>
                        <TableHeaderCell>Mode</TableHeaderCell>
                        <TableHeaderCell>Buckets</TableHeaderCell>
                        <TableHeaderCell>Total</TableHeaderCell>
                        <TableHeaderCell>Recorded</TableHeaderCell>
                        <TableHeaderCell>State</TableHeaderCell>
                        <TableHeaderCell>Action</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {observations.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{formatInstant(row.asOf)}</TableCell>
                          <TableCell>{headcountModeLabel(row.mode)}</TableCell>
                          <TableCell>{bucketSummary(row)}</TableCell>
                          <TableCell>{row.total}</TableCell>
                          <TableCell>
                            <Text size={200} className={styles.muted}>
                              {row.recordedBy} · {formatInstant(row.recordedAt)}
                            </Text>
                          </TableCell>
                          <TableCell>
                            {row.supersededBy ? (
                              <Badge appearance="tint" color="subtle" size="small">
                                Superseded
                              </Badge>
                            ) : (
                              <Badge appearance="tint" color="success" size="small">
                                Current
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.supersededBy === null ? (
                              <Button
                                size="small"
                                icon={<EditRegular />}
                                onClick={() => startCorrection(row)}
                                disabled={recordMutation.isPending}
                              >
                                Correct
                              </Button>
                            ) : (
                              <Text size={200} className={styles.muted}>
                                Valid for {formatDate(row.sessionDate)}
                              </Text>
                            )}
                          </TableCell>
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
