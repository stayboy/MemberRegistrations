import {
  Badge,
  Button,
  Card,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
} from '@fluentui/react-components';
import { AddRegular, ArrowClockwiseRegular, EditRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getEvent } from '../../api/events';
import { isUnauthorized } from '../../api/errors';
import {
  listContributions,
  recordManualContribution,
  recordPledge,
} from '../../api/giving';
import {
  getOfferingCounts,
  recordOfferingCount,
  type OfferingCount,
} from '../../api/offering-counts';
import { useSession } from '../../auth/SessionProvider';
import {
  EventSessionPicker,
  type EventSessionSelection,
} from '../../components/EventSessionPicker';
import { PageFrame } from '../../components/PageFrame';
import {
  addDenomination,
  countPayload,
  countTotalMinor,
  emptyCountRows,
  lineSummary,
  removeDenomination,
  rowsFromObservation,
  setPieces,
  type CountRowDraft,
} from '../../format/offering-counts';
import { fromDateTimeLocal, toDateTimeLocal } from '../../format/ussd';
import { formatMoneyMinor } from '../../format/welfare';
import { useDateTimeFormat } from '../../shell/DateTimeProvider';
import { OfferingCountEntry } from './OfferingCountEntry';
import { OfferingCountHistory } from './OfferingCountHistory';
import type { GiftSubmission, PledgeSubmission } from './OfferingGivingForms';
import {
  AnnouncedOffertoryDialog,
  PledgeDialog,
  RecordCountDialog,
} from './OfferingDialogs';
import { OfferingSelect } from './OfferingSelect';
import { PledgeRecordPanel } from './PledgeRecordPanel';
import { RecordedOffertoriesList } from './RecordedOffertoriesList';
import { TermsDialog } from '../../components/TermsDialog';
import { useUssdStyles } from './ussd-styles';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

/**
 * USSD → Offerings count. The operator's bulk cash count for one event,
 * offering and session, following the headcount observation pattern: a
 * denomination grid entry with a live total, an append-only history, and a
 * Correct action that keeps the corrected `asOf`. The count entry, announced
 * offertory and pledge are dialogs from the page; the page lists the session's
 * offertories and links pledges to the landing worklist.
 */
export function UssdOfferingsPage() {
  const styles = useUssdStyles();
  const { baseUrl, session, signOut } = useSession();
  const { formatInstant } = useDateTimeFormat();
  const queryClient = useQueryClient();
  const token = session?.token ?? '';

  const [selection, setSelection] = useState<EventSessionSelection | null>(null);
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [rows, setRows] = useState<CountRowDraft[]>(() => emptyCountRows('GHS'));
  const [asOf, setAsOf] = useState(() => toDateTimeLocal(new Date()));
  const [correction, setCorrection] = useState<OfferingCount | null>(null);
  const [countOpen, setCountOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [offertoriesExpanded, setOffertoriesExpanded] = useState(false);
  const [termsTarget, setTermsTarget] = useState<{
    readonly offeringId: string;
    readonly name: string;
  } | null>(null);

  const [giftOpen, setGiftOpen] = useState(false);
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const [giftNotice, setGiftNotice] = useState<string | null>(null);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [pledgeNotice, setPledgeNotice] = useState<string | null>(null);
  const [pledgeError, setPledgeError] = useState<string | null>(null);

  const eventQuery = useQuery({
    queryKey: ['ussd', baseUrl, 'offering-count-event', selection?.eventId ?? ''],
    queryFn: ({ signal }) => getEvent(baseUrl, token, selection!.eventId, signal),
    enabled: Boolean(token) && selection !== null,
  });

  const offerings = eventQuery.data?.event.offerings ?? [];
  const selectedOffering =
    offerings.find((offering) => offering.offeringId === offeringId) ?? offerings[0] ?? null;
  const selectedOfferingId = selectedOffering?.offeringId ?? null;
  const currency = selectedOffering?.terms.currency ?? 'GHS';

  const countsQuery = useQuery({
    queryKey: [
      'ussd',
      baseUrl,
      'offering-counts',
      selection?.eventId ?? '',
      selection?.sessionDate ?? '',
      selectedOfferingId ?? '',
    ],
    queryFn: ({ signal }) =>
      getOfferingCounts(
        baseUrl,
        token,
        selection!.eventId,
        selection!.sessionDate,
        selectedOfferingId!,
        signal,
      ),
    enabled: Boolean(token) && selection !== null && selectedOfferingId !== null,
  });

  const contributionsQuery = useQuery({
    queryKey: [
      'ussd',
      baseUrl,
      'contributions',
      selection?.eventId ?? '',
      selection?.sessionDate ?? '',
      selectedOfferingId ?? '',
    ],
    queryFn: ({ signal }) =>
      listContributions(baseUrl, token, {
        eventId: selection!.eventId,
        offeringId: selectedOfferingId!,
        from: selection!.sessionDate,
        to: selection!.sessionDate,
        limit: 50,
        signal,
      }),
    enabled: Boolean(token) && selection !== null && selectedOfferingId !== null,
  });

  useEffect(() => {
    if (
      isUnauthorized(eventQuery.error) ||
      isUnauthorized(countsQuery.error) ||
      isUnauthorized(contributionsQuery.error)
    ) {
      void signOut();
    }
  }, [eventQuery.error, countsQuery.error, contributionsQuery.error, signOut]);

  // Keep the blank grid in step with the chosen offering's currency while the
  // entry is closed. Opening the dialog resets it through resetEntry.
  useEffect(() => {
    if (countOpen || correction !== null) return;
    setRows(emptyCountRows(currency));
  }, [currency, countOpen, correction]);

  function resetEntry(forCurrency: string = currency): void {
    setRows(emptyCountRows(forCurrency));
    setCorrection(null);
    setAsOf(toDateTimeLocal(new Date()));
    setActionError(null);
  }

  function closeCountDialog(): void {
    setCountOpen(false);
    resetEntry();
    setNotice(null);
  }

  function startRecordCount(): void {
    resetEntry();
    setNotice(null);
    setCountOpen(true);
  }

  function resetForSelection(next: EventSessionSelection | null): void {
    setSelection(next);
    setOfferingId(null);
    setNotice(null);
    setGiftNotice(null);
    setGiftError(null);
    setPledgeNotice(null);
    setPledgeError(null);
    setOffertoriesExpanded(false);
    setCountOpen(false);
    setGiftOpen(false);
    setPledgeOpen(false);
    resetEntry();
  }

  const recordMutation = useMutation({
    mutationFn: (lines: readonly { denominationMinor: number; pieces: number }[]) => {
      if (!selection || !selectedOfferingId)
        throw new Error('Choose an event, session and offering first.');
      return recordOfferingCount(baseUrl, token, selection.eventId, {
        sessionDate: selection.sessionDate,
        offeringId: selectedOfferingId,
        lines,
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
          : 'Offering count recorded.',
      );
      setCountOpen(false);
      resetEntry();
      void queryClient.invalidateQueries({ queryKey: ['ussd', baseUrl, 'offering-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['offerings', baseUrl, 'summary'] });
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

  const giftMutation = useMutation({
    mutationFn: (input: GiftSubmission) => {
      if (!selection) throw new Error('Choose an event session first.');
      return recordManualContribution(baseUrl, token, {
        memberNo: input.memberNo,
        offeringId: input.offeringId,
        eventId: selection.eventId,
        sessionDate: input.sessionDate,
        amountMinor: input.amountMinor,
        idempotencyKey: input.idempotencyKey,
      });
    },
    onSuccess: (gift) => {
      setGiftError(null);
      setGiftNotice(
        `Announced offertory recorded (${gift.reference}). It is separate from the counted cash.`,
      );
      void queryClient.invalidateQueries({ queryKey: ['offerings', baseUrl, 'summary'] });
      void queryClient.invalidateQueries({ queryKey: ['ussd', baseUrl, 'contributions'] });
    },
    onError: (error: unknown) => {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setGiftNotice(null);
      setGiftError(errorMessage(error));
    },
  });

  const pledgeMutation = useMutation({
    mutationFn: (input: PledgeSubmission) => {
      if (!selection) throw new Error('Choose an event session first.');
      return recordPledge(baseUrl, token, {
        memberNo: input.memberNo,
        offeringId: input.offeringId,
        eventId: selection.eventId,
        sessionDate: selection.sessionDate,
        amountMinor: input.amountMinor,
        expectedOn: input.expectedOn,
        ...(input.officerMemberNo ? { followUpOfficerMemberNo: input.officerMemberNo } : {}),
        idempotencyKey: input.idempotencyKey,
      });
    },
    onSuccess: (pledge) => {
      setPledgeError(null);
      setPledgeNotice(`Pledge recorded (${pledge.idempotencyKey}). It stays member-level.`);
      void queryClient.invalidateQueries({ queryKey: ['offerings', baseUrl, 'summary'] });
      void queryClient.invalidateQueries({ queryKey: ['offerings', baseUrl, 'pledges'] });
    },
    onError: (error: unknown) => {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setPledgeNotice(null);
      setPledgeError(errorMessage(error));
    },
  });

  const page = countsQuery.data;
  const current = page?.current ?? null;
  const observations = page?.observations ?? [];
  const parsed = countPayload(rows);
  const liveTotal = countTotalMinor(rows);

  function beginCorrection(row: OfferingCount): void {
    setCorrection(row);
    setRows(rowsFromObservation(row, row.currency));
    setActionError(null);
    setNotice(null);
    setCountOpen(true);
  }

  function submitCount(): void {
    if ('error' in parsed) {
      setActionError(parsed.error);
      return;
    }
    recordMutation.mutate(parsed.lines);
  }

  const entryCurrency = correction?.currency ?? currency;

  const offeringPicker = (
    <div className={styles.fields}>
      <OfferingSelect
        offerings={offerings}
        value={selectedOfferingId}
        label="Offering to count"
        disabled={recordMutation.isPending}
        onChange={(next) => {
          setOfferingId(next);
          resetEntry(
            offerings.find((offering) => offering.offeringId === next)?.terms.currency ?? currency,
          );
          setNotice(null);
        }}
      />
      {selectedOffering ? (
        <Button
          appearance="secondary"
          onClick={() =>
            setTermsTarget({
              offeringId: selectedOffering.offeringId,
              name: selectedOffering.name,
            })
          }
        >
          View terms
        </Button>
      ) : null}
    </div>
  );

  return (
    <PageFrame
      sectionId="ussd"
      title="Offerings count"
      submenu="Offerings count"
      description="The counted cash for one event, offering and session. Every entry is an append-only observation with an asOf; a correction supersedes the current row without deleting it and keeps the moment counted. Counted cash is never merged with member or visitor offertories."
      actions={
        <>
          <Button
            icon={<AddRegular />}
            appearance="primary"
            disabled={!selection || !selectedOfferingId || recordMutation.isPending}
            onClick={startRecordCount}
          >
            Record count
          </Button>
          <Button
            icon={<ArrowClockwiseRegular />}
            disabled={!selection || countsQuery.isFetching}
            onClick={() => {
              void eventQuery.refetch();
              void countsQuery.refetch();
              void contributionsQuery.refetch();
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
              <MessageBarTitle>The offering count could not be recorded</MessageBarTitle>
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
              Choose an event session above to record or correct its offering count.
            </Text>
          </div>
        ) : eventQuery.isPending ? (
          <div className={styles.state}>
            <Spinner label="Loading the event and its offerings…" />
          </div>
        ) : eventQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The event could not be loaded</MessageBarTitle>
              {errorMessage(eventQuery.error)}
            </MessageBarBody>
          </MessageBar>
        ) : offerings.length === 0 ? (
          <div className={styles.empty}>
            <Text className={styles.emptyTitle}>No active offering on this event</Text>
            <Text size={200} className={styles.muted}>
              Attach an offering to the event before counting its cash. Announced offertories and
              pledges also need an attached offering.
            </Text>
          </div>
        ) : (
          <>
            <Card className={styles.panel}>
              <div className={styles.panelBody}>
                <Text size={200} className={styles.muted}>
                  Count group
                </Text>
                {offeringPicker}
              </div>
            </Card>

            {countsQuery.isPending ? (
              <div className={styles.state}>
                <Spinner label="Loading offering counts…" />
              </div>
            ) : countsQuery.isError ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>Offering counts could not be loaded</MessageBarTitle>
                  {errorMessage(countsQuery.error)}
                </MessageBarBody>
              </MessageBar>
            ) : (
              <>
                <Card className={styles.panel}>
                  <div className={styles.panelBody}>
                    <Text size={200} className={styles.muted}>
                      Current counted cash
                    </Text>
                    {current ? (
                      <>
                        <Text className={styles.code}>
                          {formatMoneyMinor(current.totalMinor, current.currency)}
                        </Text>
                        <div className={styles.badgeRow}>
                          <Badge appearance="tint" color="brand" size="small">
                            {current.currency}
                          </Badge>
                          <Text size={200}>as of {formatInstant(current.asOf)}</Text>
                          <Text size={200} className={styles.muted}>
                            terms v{current.termsVersion}
                          </Text>
                        </div>
                        <Text size={200} className={styles.muted}>
                          {current.lines
                            .map((line) => lineSummary(line, current.currency))
                            .join(' · ')}{' '}
                          · recorded {formatInstant(current.recordedAt)}
                        </Text>
                        <div>
                          <Button
                            size="small"
                            icon={<EditRegular />}
                            disabled={recordMutation.isPending}
                            onClick={() => beginCorrection(current)}
                          >
                            Correct
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Text size={200} className={styles.muted}>
                        No count recorded for this event, offering and session yet.
                      </Text>
                    )}
                  </div>
                </Card>

                <OfferingCountHistory
                  observations={observations}
                  currency={currency}
                  pending={recordMutation.isPending}
                  formatInstant={formatInstant}
                  onCorrect={beginCorrection}
                />

                {contributionsQuery.isError ? (
                  <MessageBar intent="error">
                    <MessageBarBody>
                      <MessageBarTitle>The recorded offertories could not be loaded</MessageBarTitle>
                      {errorMessage(contributionsQuery.error)}
                      <Button
                        size="small"
                        appearance="transparent"
                        onClick={() => {
                          void contributionsQuery.refetch();
                        }}
                      >
                        Retry
                      </Button>
                    </MessageBarBody>
                  </MessageBar>
                ) : null}

                <div className={styles.listPanels}>
                  <RecordedOffertoriesList
                    contributions={contributionsQuery.data ?? []}
                    offeringName={selectedOffering?.name ?? ''}
                    currency={currency}
                    expanded={offertoriesExpanded}
                    formatInstant={formatInstant}
                    onToggle={() => setOffertoriesExpanded((value) => !value)}
                    onRecord={() => setGiftOpen(true)}
                  />
                  <PledgeRecordPanel onRecord={() => setPledgeOpen(true)} />
                </div>
              </>
            )}
          </>
        )}
      </div>

      <RecordCountDialog
        open={countOpen}
        title={correction ? 'Correct offering count' : 'Record offering count'}
        description={
          correction
            ? `Keeping asOf ${formatInstant(correction.asOf)}. The earlier observation stays readable and valid for its asOf.`
            : undefined
        }
        onClose={closeCountDialog}
      >
        <OfferingCountEntry
          currency={entryCurrency}
          rows={rows}
          totalMinor={liveTotal}
          asOf={asOf}
          correction={correction}
          pending={recordMutation.isPending}
          error={actionError}
          formatInstant={formatInstant}
          onAddDenomination={(denominationMinor) =>
            setRows((visible) => addDenomination(visible, denominationMinor))
          }
          onPiecesChange={(denominationMinor, pieces) =>
            setRows((visible) => setPieces(visible, denominationMinor, pieces))
          }
          onRemove={(denominationMinor) =>
            setRows((visible) => removeDenomination(visible, denominationMinor))
          }
          onAsOfChange={setAsOf}
          onSubmit={submitCount}
          onCancelCorrection={closeCountDialog}
          showHeader={false}
          onCancel={closeCountDialog}
        />
      </RecordCountDialog>

      <AnnouncedOffertoryDialog
        open={giftOpen}
        offerings={offerings}
        defaultSessionDate={selection?.sessionDate ?? toDateTimeLocal(new Date()).slice(0, 10)}
        currency={currency}
        pending={giftMutation.isPending}
        notice={giftNotice}
        error={giftError}
        onClose={() => {
          setGiftOpen(false);
          setGiftNotice(null);
          setGiftError(null);
        }}
        onSubmit={(input) => giftMutation.mutate(input)}
      />

      <PledgeDialog
        open={pledgeOpen}
        offerings={offerings}
        currency={currency}
        pending={pledgeMutation.isPending}
        notice={pledgeNotice}
        error={pledgeError}
        onClose={() => {
          setPledgeOpen(false);
          setPledgeNotice(null);
          setPledgeError(null);
        }}
        onSubmit={(input) => pledgeMutation.mutate(input)}
      />

      <TermsDialog offering={termsTarget} onClose={() => setTermsTarget(null)} />
    </PageFrame>
  );
}
