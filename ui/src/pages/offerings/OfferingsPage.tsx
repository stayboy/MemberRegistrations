import {
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
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
  lastNDaysWindow,
  monthToDateWindow,
  ussdPreviewFromEvents,
  yearToDateWindow,
} from '../../format/offerings';
import { useDateTimeFormat } from '../../shell/DateTimeProvider';
import { BreakdownPanel } from './BreakdownPanel';
import { OfferingsError } from './OfferingsState';
import { OfferingsSkeleton } from './OfferingsSkeleton';
import { PledgeWorklist } from './PledgeWorklist';
import { SummaryCards } from './SummaryCards';
import { TermsDialog } from '../../components/TermsDialog';
import { UssdPreview } from './UssdPreview';
import { useOfferingsStyles } from './offerings-styles';

const WORKLIST_LIMIT = 50;
/** The USSD preview looks one month ahead from today (UTC), independently of the window. */
const PREVIEW_DAYS = 30;

type QuickRange = 'year' | '90' | 'month' | 'custom';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

/**
 * Events → Offerings (ticket 23, FR-30/FR-40). The dashboard landing reads one
 * summary request for the four KPI tiles and the tabbed breakdown, the existing
 * pledge list for the unwindowed worklist and the events list only for the
 * one-line USSD preview. It never renders the zeroed FR-29 event/offering stats
 * (R8) and never reads a contact value.
 */
export function OfferingsPage() {
  const styles = useOfferingsStyles();
  const { formatDate } = useDateTimeFormat();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const queryClient = useQueryClient();

  const [window, setWindow] = useState<DateWindow>(() => yearToDateWindow());
  const [quickRange, setQuickRange] = useState<QuickRange>('year');
  const previewWindow = useMemo(() => {
    const from = yearToDateWindow().to;
    return { from, to: shiftUtcDate(from, PREVIEW_DAYS) ?? from };
  }, []);

  const [termsTarget, setTermsTarget] = useState<OfferingSummaryGroup | null>(null);
  const [reassignTarget, setReassignTarget] = useState<{
    readonly pledge: PledgeItem;
    readonly officerMemberNo: string;
  } | null>(null);

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

  function applyWindow(next: DateWindow, range: QuickRange): void {
    setWindow(next);
    setQuickRange(range);
  }

  return (
    <PageFrame
      sectionId="events"
      title="Offerings"
      submenu="Offerings"
      hideBadge
      actions={
        <div className={styles.headerActions}>
          <div className={styles.quickRanges} role="group" aria-label="Quick ranges">
            <Button
              size="small"
              appearance={quickRange === 'year' ? 'secondary' : 'transparent'}
              onClick={() => applyWindow(yearToDateWindow(), 'year')}
            >
              This year
            </Button>
            <Button
              size="small"
              appearance={quickRange === '90' ? 'secondary' : 'transparent'}
              onClick={() => applyWindow(lastNDaysWindow(90), '90')}
            >
              90 days
            </Button>
            <Button
              size="small"
              appearance={quickRange === 'month' ? 'secondary' : 'transparent'}
              onClick={() => applyWindow(monthToDateWindow(), 'month')}
            >
              This month
            </Button>
            <Button
              size="small"
              appearance={quickRange === 'custom' ? 'secondary' : 'transparent'}
              onClick={() => setQuickRange('custom')}
            >
              Custom
            </Button>
          </div>
          <DateWindowControl
            value={window}
            onChange={(next) => applyWindow(next, 'custom')}
            label="Offerings date window"
            hint=""
          />
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
        </div>
      }
    >
      <div className={styles.page}>
        {reassignMutation.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The pledge could not be reassigned</MessageBarTitle>
              {errorMessage(reassignMutation.error)}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {summaryQuery.isError ? (
          <OfferingsError
            title="Offerings could not be loaded"
            error={summaryQuery.error}
            onRetry={() => {
              void summaryQuery.refetch();
            }}
          />
        ) : summaryQuery.isPending ? (
          <OfferingsSkeleton />
        ) : summary ? (
          <>
            <SummaryCards summary={summary} />

            <BreakdownPanel
              summary={summary}
              formatDate={formatDate}
              onViewTerms={setTermsTarget}
            />

            {pledgesQuery.isError ? (
              <OfferingsError
                title="The pledge worklist could not be loaded"
                error={pledgesQuery.error}
                onRetry={() => {
                  void pledgesQuery.refetch();
                }}
              />
            ) : pledgesQuery.isPending ? (
              <div className={styles.state}>
                <Spinner label="Loading the pledge worklist…" />
              </div>
            ) : (
              <PledgeWorklist
                pledges={pledges}
                windowPledges={summary.pledges}
                formatDate={formatDate}
                onReassign={(pledge, officerMemberNo) =>
                  setReassignTarget({ pledge, officerMemberNo })
                }
                limit={WORKLIST_LIMIT}
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
          </>
        ) : null}
      </div>

      <TermsDialog offering={termsTarget} onClose={() => setTermsTarget(null)} />

      <ReasonDialog
        open={reassignTarget !== null}
        title={
          reassignTarget
            ? `Reassign ${reassignTarget.pledge.memberName}'s pledge to ${reassignTarget.officerMemberNo}`
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
            pledge: reassignTarget.pledge,
            officerMemberNo: reassignTarget.officerMemberNo,
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
