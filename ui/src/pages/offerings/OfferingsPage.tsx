import {
  Button,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Text,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { isUnauthorized } from '../../api/errors';
import { listEvents } from '../../api/events';
import {
  getOfferingsSummary,
  listPledges,
  reassignPledge,
  type OfferingSummaryGroup,
  type PledgeItem,
} from '../../api/offerings';
import { useSession } from '../../auth/SessionProvider';
import { DateWindowControl } from '../../components/DateWindowControl';
import { PageFrame } from '../../components/PageFrame';
import { ReasonDialog } from '../../components/ReasonDialog';
import type { DateWindow } from '../../format/date-window';
import { shiftUtcDate } from '../../format/date-window';
import {
  ussdPreviewFromEvents,
  worklistScopeLabel,
  yearToDateWindow,
} from '../../format/offerings';
import { useDateTimeFormat } from '../../shell/DateTimeProvider';
import { GroupTotalsTable } from './GroupTotalsTable';
import { MemberTotalsTable } from './MemberTotalsTable';
import { OfferingsError, OfferingsLoading } from './OfferingsState';
import { PledgeWorklist } from './PledgeWorklist';
import { SummaryCards } from './SummaryCards';
import { TermsDialog } from './TermsDialog';
import { UssdPreview } from './UssdPreview';
import { useOfferingsStyles } from './offerings-styles';

const WORKLIST_LIMIT = 50;
/** The USSD preview looks one month ahead from today (UTC), independently of the window. */
const PREVIEW_DAYS = 30;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

/**
 * Events → Offerings (ticket 23, FR-30/FR-40). The landing reads one summary
 * request for the member/offering/event totals, the existing pledge list for
 * the unwindowed worklist and the events list only for the USSD preview. It
 * never renders the zeroed FR-29 event/offering stats (R8) and never reads a
 * contact value.
 */
export function OfferingsPage() {
  const styles = useOfferingsStyles();
  const { formatDate } = useDateTimeFormat();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const queryClient = useQueryClient();

  // The default is 1 January of the current UTC year to today (23-Q5).
  const [window, setWindow] = useState<DateWindow>(() => yearToDateWindow());
  const previewWindow = useMemo(() => {
    const from = yearToDateWindow().to;
    return { from, to: shiftUtcDate(from, PREVIEW_DAYS) ?? from };
  }, []);

  const [termsTarget, setTermsTarget] = useState<OfferingSummaryGroup | null>(null);
  const [reassignTarget, setReassignTarget] = useState<PledgeItem | null>(null);
  const [officerMemberNo, setOfficerMemberNo] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ['offerings', baseUrl, 'summary', window.from, window.to],
    queryFn: ({ signal }) => getOfferingsSummary(baseUrl, token, window.from, window.to, signal),
    enabled: Boolean(token),
  });

  const pledgesQuery = useQuery({
    queryKey: ['offerings', baseUrl, 'pledges', WORKLIST_LIMIT],
    queryFn: ({ signal }) => listPledges(baseUrl, token, { limit: WORKLIST_LIMIT, signal }),
    enabled: Boolean(token),
  });

  const eventsQuery = useQuery({
    queryKey: ['events', baseUrl, 'offerings-preview', previewWindow.from, previewWindow.to],
    queryFn: ({ signal }) =>
      listEvents(baseUrl, token, {
        from: previewWindow.from,
        to: previewWindow.to,
        limit: 100,
        signal,
      }),
    enabled: Boolean(token),
  });

  const reassignMutation = useMutation({
    mutationFn: (input: {
      readonly pledge: PledgeItem;
      readonly officerMemberNo: string;
      readonly reason: string;
    }) => reassignPledge(baseUrl, token, input.pledge.id, input.officerMemberNo, input.reason),
    onSuccess: () => {
      setReassignTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['offerings', baseUrl, 'pledges'] });
      void queryClient.invalidateQueries({ queryKey: ['offerings', baseUrl, 'summary'] });
    },
  });

  useEffect(() => {
    if (
      isUnauthorized(summaryQuery.error) ||
      isUnauthorized(pledgesQuery.error) ||
      isUnauthorized(eventsQuery.error)
    ) {
      void signOut();
    }
  }, [summaryQuery.error, pledgesQuery.error, eventsQuery.error, signOut]);

  const summary = summaryQuery.data;
  const pledges = pledgesQuery.data ?? [];
  const ussdPreview = useMemo(
    () => ussdPreviewFromEvents(eventsQuery.data ?? [], previewWindow.from),
    [eventsQuery.data, previewWindow.from],
  );

  function startReassign(pledge: PledgeItem): void {
    setActionError(null);
    reassignMutation.reset();
    if (!officerMemberNo.trim()) {
      setActionError('Enter the new follow-up officer member number before reassigning a pledge.');
      return;
    }
    setReassignTarget(pledge);
  }

  return (
    <PageFrame
      sectionId="events"
      title="Offerings"
      submenu="Offerings"
      description="Church giving totals by member, offering and event for the selected window, with the pledge follow-up worklist. Visitor gifts are shown separately and no contact values are shown."
      actions={
        <Button
          icon={<ArrowClockwiseRegular />}
          onClick={() => {
            void summaryQuery.refetch();
            void pledgesQuery.refetch();
            void eventsQuery.refetch();
          }}
          disabled={summaryQuery.isFetching || pledgesQuery.isFetching}
        >
          Refresh
        </Button>
      }
    >
      <div className={styles.page}>
        <div className={styles.toolbar}>
          <DateWindowControl
            value={window}
            onChange={setWindow}
            label="Offerings date window"
            hint="UTC dates · the member money cards and totals use this window."
          />
        </div>

        {summaryQuery.isError ? (
          <OfferingsError
            title="The offerings totals could not be loaded"
            error={summaryQuery.error}
            onRetry={() => {
              void summaryQuery.refetch();
            }}
          />
        ) : null}

        {actionError ? (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>Pledge follow-up needs attention</MessageBarTitle>
              {actionError}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {reassignMutation.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The pledge could not be reassigned</MessageBarTitle>
              {errorMessage(reassignMutation.error)}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {summaryQuery.isPending ? (
          <OfferingsLoading label="Loading the offerings totals…" />
        ) : summary ? (
          <>
            <SummaryCards summary={summary} />

            <MemberTotalsTable
              members={summary.members}
              currency={summary.currency}
              formatDate={formatDate}
            />

            <div className={styles.panels}>
              <GroupTotalsTable
                title="Totals by offering"
                ariaLabel="Totals by offering"
                nameHeader="Offering"
                currency={summary.currency}
                rows={summary.offerings.map((offering) => ({
                  id: offering.offeringId,
                  name: offering.name,
                  paidMinor: offering.paidMinor,
                  pledgedMinor: offering.pledgedMinor,
                  outstandingMinor: offering.outstandingMinor,
                }))}
                emptyTitle="No offerings in this window"
                emptyHint="Paid gifts or relevant pledges will appear here."
                renderAction={(row) => (
                  <Button
                    size="small"
                    appearance="transparent"
                    onClick={() => {
                      setTermsTarget({
                        offeringId: row.id,
                        name: row.name,
                        paidMinor: row.paidMinor,
                        pledgedMinor: row.pledgedMinor,
                        outstandingMinor: row.outstandingMinor,
                      });
                    }}
                  >
                    View terms
                  </Button>
                )}
              />

              <GroupTotalsTable
                title="Totals by event"
                ariaLabel="Totals by event"
                nameHeader="Event"
                currency={summary.currency}
                rows={summary.events.map((event) => ({
                  id: event.eventId,
                  name: event.name,
                  paidMinor: event.paidMinor,
                  pledgedMinor: event.pledgedMinor,
                  outstandingMinor: event.outstandingMinor,
                }))}
                emptyTitle="No events in this window"
                emptyHint="Paid gifts or relevant pledges will appear here."
              />
            </div>
          </>
        ) : null}

        <div className={styles.toolbar}>
          <Field
            label="Reassign to (officer member no)"
            hint="Used by the Reassign action on any worklist row. The officer must be an active presbyter."
          >
            <Input
              value={officerMemberNo}
              onChange={(_, data) => setOfficerMemberNo(data.value)}
              placeholder="e.g. M-1001"
            />
          </Field>
        </div>

        {pledgesQuery.isError ? (
          <OfferingsError
            title="The pledge worklist could not be loaded"
            error={pledgesQuery.error}
            onRetry={() => {
              void pledgesQuery.refetch();
            }}
          />
        ) : pledgesQuery.isPending ? (
          <OfferingsLoading label="Loading the pledge worklist…" />
        ) : (
          <PledgeWorklist
            pledges={pledges}
            scopeLabel={worklistScopeLabel(pledges.length, WORKLIST_LIMIT)}
            formatDate={formatDate}
            onReassign={startReassign}
          />
        )}

        {eventsQuery.isError ? (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>The USSD preview could not be composed</MessageBarTitle>
              The events list is unavailable; the rest of the landing still works.{' '}
              {errorMessage(eventsQuery.error)}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        <UssdPreview preview={ussdPreview} formatDate={formatDate} />

        {summaryQuery.isPending ? null : summary && summary.members.length === 0 ? (
          <Text size={200} className={styles.muted}>
            No member totals in this window yet. Widen the date window or record a paid contribution
            to see the member breakdown.
          </Text>
        ) : null}
      </div>

      <TermsDialog offering={termsTarget} onClose={() => setTermsTarget(null)} />

      <ReasonDialog
        open={reassignTarget !== null}
        title={
          reassignTarget
            ? `Reassign ${reassignTarget.memberName}'s pledge to ${officerMemberNo}`
            : 'Reassign the pledge'
        }
        label="Reason"
        hint="The old and new officer remain in the pledge history (FR-34)."
        confirmLabel="Reassign pledge"
        required
        pending={reassignMutation.isPending}
        onConfirm={(reason) => {
          if (!reassignTarget) return;
          reassignMutation.mutate({
            pledge: reassignTarget,
            officerMemberNo: officerMemberNo.trim(),
            reason,
          });
        }}
        onClose={() => {
          setReassignTarget(null);
          reassignMutation.reset();
        }}
      />
    </PageFrame>
  );
}
