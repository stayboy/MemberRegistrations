import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ChurchOfferingSummary, PledgeItem } from '../../api/offerings';
import { formatMoneyMinor } from '../../format/welfare';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { BreakdownPanel } from './BreakdownPanel';
import { GroupTotalsTable } from './GroupTotalsTable';
import { MemberTotalsTable } from './MemberTotalsTable';
import { OfferingsError, OfferingsLoading } from './OfferingsState';
import { PledgeWorklist } from './PledgeWorklist';
import { SummaryCards } from './SummaryCards';
import { UssdPreview } from './UssdPreview';

const money = (amountMinor: number): string => formatMoneyMinor(amountMinor, 'GHS');
const date = (value: string | null | undefined): string => value ?? '—';

const SUMMARY: ChurchOfferingSummary = {
  from: '2026-01-01',
  to: '2026-11-07',
  currency: 'GHS',
  totalPaidMinor: 120_000,
  totalPledgedMinor: 60_000,
  totalOutstandingMinor: 20_000,
  countedMinor: 150_000,
  varianceMinor: 27_000,
  visitors: { count: 3, paidMinor: 3_000 },
  members: [
    {
      memberNo: 'M-1',
      name: 'Kwame Asante',
      paidMinor: 90_000,
      pledgedMinor: 40_000,
      outstandingMinor: 10_000,
      lastGivenOn: '2026-11-01',
    },
    {
      memberNo: 'M-2',
      name: 'Ama Mensah',
      paidMinor: 30_000,
      pledgedMinor: 20_000,
      outstandingMinor: 10_000,
      lastGivenOn: null,
    },
  ],
  offerings: [
    {
      offeringId: 'offering-1',
      name: 'Tithe',
      paidMinor: 120_000,
      pledgedMinor: 60_000,
      outstandingMinor: 20_000,
      countedMinor: 150_000,
    },
  ],
  events: [
    {
      eventId: 'event-1',
      name: 'Sunday Service',
      paidMinor: 120_000,
      pledgedMinor: 60_000,
      outstandingMinor: 20_000,
      countedMinor: 150_000,
    },
  ],
  pledges: { pending: 2, honored: 1, dishonored: 0, overdue: 1 },
};

const PLEDGE: PledgeItem = {
  id: 'pledge-1',
  memberNo: 'M-1',
  memberName: 'Kwame Asante',
  offeringId: 'offering-1',
  offeringName: 'Tithe',
  eventId: 'event-1',
  sessionDate: '2026-11-01',
  amountMinor: 5_000,
  currency: 'GHS',
  expectedOn: '2026-11-20',
  followUpOfficerMemberNo: 'M-2',
  officerName: 'Ama Mensah',
  status: 'pending',
  reason: null,
  nextReminder: '2026-11-13',
  settledContributionId: null,
  termsVersion: 1,
  idempotencyKey: 'key-1',
  createdAt: '2026-11-01T10:00:00.000Z',
};

function render(node: ReactElement): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ThemeProvider>{node}</ThemeProvider>
    </MemoryRouter>,
  );
}

describe('SummaryCards', () => {
  it('renders the four dashboard tiles with visitors separate and counted never added', () => {
    const markup = render(<SummaryCards summary={SUMMARY} />);

    expect(markup).toContain('Member paid');
    expect(markup).toContain('Counted cash');
    expect(markup).toContain('Reconciliation');
    expect(markup).toContain('Open pledges');
    expect(markup).toContain(money(120_000));
    expect(markup).toContain(money(150_000));
    expect(markup).toContain(money(27_000));
    expect(markup).toContain(money(20_000));
    expect(markup).toContain('Visitors');
    expect(markup).toContain('separate');
    expect(markup).toContain('never added');
    expect(markup).toContain('Record a count');
    expect(markup).toContain('2 pending · 1 overdue');
    expect(markup).not.toContain('All members + visitors');
  });

  it('carries no contact values', () => {
    const markup = render(<SummaryCards summary={SUMMARY} />);
    expect(markup).not.toContain('@');
    expect(markup).not.toContain('+233');
  });
});

describe('MemberTotalsTable', () => {
  it('renders member number, name, money and last given without a Follow-up column', () => {
    const markup = render(
      <MemberTotalsTable members={SUMMARY.members} currency="GHS" formatDate={date} />,
    );

    expect(markup).toContain('Kwame Asante');
    expect(markup).toContain('M-1');
    expect(markup).toContain(money(90_000));
    expect(markup).toContain('2026-11-01');
    expect(markup).not.toContain('Follow-up');
    expect(markup).not.toContain('@');
  });

  it('renders the empty state', () => {
    const markup = render(<MemberTotalsTable members={[]} currency="GHS" formatDate={date} />);
    expect(markup).toContain('No member giving in this window');
  });
});

describe('GroupTotalsTable', () => {
  it('renders the by-offering rows with share, counted and an optional action', () => {
    const markup = render(
      <GroupTotalsTable
        ariaLabel="Totals by offering"
        nameHeader="Offering"
        currency="GHS"
        rows={[
          {
            id: 'offering-1',
            name: 'Tithe',
            paidMinor: 120_000,
            pledgedMinor: 60_000,
            outstandingMinor: 20_000,
            countedMinor: 150_000,
          },
        ]}
        emptyTitle="No offerings in this window"
        emptyHint="Paid gifts or relevant pledges will appear here."
        showShare
        totalPaidMinor={120_000}
        renderAction={() => <button type="button">View terms</button>}
      />,
    );

    expect(markup).toContain('Tithe');
    expect(markup).toContain(money(120_000));
    expect(markup).toContain(money(150_000));
    expect(markup).toContain('Share of paid');
    expect(markup).toContain('100%');
    expect(markup).toContain('Counted');
    expect(markup).toContain('View terms');
  });

  it('renders the empty state', () => {
    const markup = render(
      <GroupTotalsTable
        ariaLabel="Totals by event"
        nameHeader="Event"
        currency="GHS"
        rows={[]}
        emptyTitle="No events in this window"
        emptyHint="Paid gifts or relevant pledges will appear here."
      />,
    );
    expect(markup).toContain('No events in this window');
  });
});

describe('BreakdownPanel', () => {
  it('renders the tabs, the default offering rows and the reconcile footer', () => {
    const markup = render(
      <BreakdownPanel summary={SUMMARY} formatDate={date} onViewTerms={() => {}} />,
    );

    expect(markup).toContain('Breakdown');
    expect(markup).toContain('By offering');
    expect(markup).toContain('By event');
    expect(markup).toContain('By member');
    expect(markup).toContain('Tithe');
    expect(markup).toContain('Reconciles to the tiles above.');
  });
});

describe('PledgeWorklist', () => {
  it('renders five-column rows, the window header and the all-time footer', () => {
    const markup = render(
      <PledgeWorklist
        pledges={[
          PLEDGE,
          {
            ...PLEDGE,
            id: 'pledge-2',
            memberNo: 'M-2',
            memberName: 'Ama Mensah',
            status: 'overdue',
            nextReminder: null,
          },
        ]}
        windowPledges={SUMMARY.pledges}
        formatDate={date}
        onReassign={() => {}}
      />,
    );

    expect(markup).toContain('Kwame Asante');
    expect(markup).toContain('Tithe');
    expect(markup).toContain('Ama Mensah');
    expect(markup).toContain('Pending');
    expect(markup).toContain('Overdue');
    expect(markup).toContain('This window: 1 honored · 0 dishonored');
    expect(markup).toContain('All time · newest first · up to 50');
    expect(markup).toContain('Show details for Kwame Asante');
    expect(markup).not.toContain('@');
  });

  it('renders the empty state', () => {
    const markup = render(
      <PledgeWorklist
        pledges={[]}
        windowPledges={SUMMARY.pledges}
        formatDate={date}
        onReassign={() => {}}
      />,
    );
    expect(markup).toContain('No pledges to follow up');
  });
});

describe('OfferingsLoading and OfferingsError', () => {
  it('renders the loading label', () => {
    const markup = render(<OfferingsLoading label="Loading the offerings totals…" />);
    expect(markup).toContain('Loading the offerings totals…');
  });

  it('renders the error detail and a retry action', () => {
    const markup = render(
      <OfferingsError
        title="Offerings could not be loaded"
        error={new Error('Gateway unavailable')}
        onRetry={() => {}}
      />,
    );
    expect(markup).toContain('Offerings could not be loaded');
    expect(markup).toContain('Gateway unavailable');
    expect(markup).toContain('Retry');
  });

  it('falls back to the connection hint for an unknown error', () => {
    const markup = render(
      <OfferingsError
        title="The pledge worklist could not be loaded"
        error={null}
        onRetry={() => {}}
      />,
    );
    expect(markup).toContain('Check the API connection and try again.');
  });
});

describe('UssdPreview', () => {
  it('renders the one-line footer with the shortcode, session, offerings and caption', () => {
    const markup = render(
      <UssdPreview
        preview={{
          eventId: 'event-1',
          eventName: 'Foundation service',
          sessionDate: '2999-01-10',
          lines: ['Choose offering(s)', '1 Tithe', '2 Missions', '0 More'],
        }}
        formatDate={date}
      />,
    );

    expect(markup).toContain('USSD · upcoming');
    expect(markup).toContain('*714*88#');
    expect(markup).toContain('Foundation service');
    expect(markup).toContain('1 Tithe · 2 Missions · 0 More');
    expect(markup).toContain('Preview only; no USSD session is opened.');
  });

  it('renders the no-upcoming-event state', () => {
    const markup = render(<UssdPreview preview={null} formatDate={date} />);
    expect(markup).toContain('No upcoming event to preview.');
  });
});
