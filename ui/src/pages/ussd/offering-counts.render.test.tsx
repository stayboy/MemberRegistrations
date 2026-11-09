import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { EventOfferingItem } from '../../api/events';
import type { OfferingCount } from '../../api/offering-counts';
import type { ContributionItem } from '../../api/giving';
import { emptyCountRows, gridDenominations, type CountRowDraft } from '../../format/offering-counts';
import { formatMoneyMinor } from '../../format/welfare';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { OfferingCountEntry } from './OfferingCountEntry';
import { OfferingCountHistory } from './OfferingCountHistory';
import { AnnouncedOffertoryForm, PledgeForm } from './OfferingGivingForms';
import { PledgeRecordPanel } from './PledgeRecordPanel';
import { RecordedOffertoriesList } from './RecordedOffertoriesList';

const formatInstant = (value: string): string => value;
const money = (amountMinor: number, currency = 'GHS'): string =>
  formatMoneyMinor(amountMinor, currency);

const OFFERINGS: readonly EventOfferingItem[] = [
  {
    offeringId: 'offering-1',
    name: 'Tithe',
    availableUntil: null,
    expired: false,
    terms: {
      version: 1,
      name: 'Tithe',
      purpose: 'The regular tithe',
      kind: 'tithe',
      currency: 'GHS',
      targetMinor: null,
      defaultAmountMinor: null,
      startsOn: null,
      endsOn: null,
      availableUntil: null,
      scripture: null,
      gatewayAccount: null,
      gatewayMetadata: null,
      createdAt: '2026-01-01T09:00:00.000Z',
      createdBy: 'officer-1',
      reason: null,
    },
    exceptions: [],
    stats: {
      attachedEvents: 1,
      pledgedMinor: 0,
      paidMinor: 0,
      pendingMinor: 0,
      honorRate: 0,
      contributionCount: 0,
    },
  },
];

const COUNT: OfferingCount = {
  id: 'count-1',
  eventId: 'event-1',
  offeringId: 'offering-1',
  sessionDate: '2026-11-01',
  asOf: '2026-11-01T10:00:00.000Z',
  currency: 'GHS',
  termsVersion: 1,
  lines: [
    { denominationMinor: 2000, pieces: 39 },
    { denominationMinor: 1000, pieces: 40 },
  ],
  totalMinor: 118_000,
  recordedAt: '2026-11-01T10:05:00.000Z',
  recordedBy: 'officer-1',
  supersedesId: null,
  supersededBy: null,
};

const CONTRIBUTION: ContributionItem = {
  id: 'contribution-1',
  memberNo: 'M-1001',
  visitorName: null,
  offeringId: 'offering-1',
  eventId: 'event-1',
  sessionDate: '2026-11-01',
  amountMinor: 50_000,
  currency: 'GHS',
  channel: 'manual',
  status: 'paid',
  reference: 'MR-TEST000001',
  idempotencyKey: 'manual-gift:1',
  termsVersion: 1,
  createdAt: '2026-11-01T09:12:00.000Z',
};

function render(node: ReactElement): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ThemeProvider>{node}</ThemeProvider>
    </MemoryRouter>,
  );
}

function gridRows(
  pieces: Readonly<Record<number, string>> = {},
  extras: readonly CountRowDraft[] = [],
): CountRowDraft[] {
  return [
    ...emptyCountRows('GHS').map((row) => ({
      ...row,
      pieces: pieces[row.denominationMinor] ?? '',
    })),
    ...extras,
  ];
}

function entry(overrides: Partial<Parameters<typeof OfferingCountEntry>[0]> = {}): string {
  return render(
    <OfferingCountEntry
      currency="GHS"
      rows={gridRows({ 2000: '39', 1000: '40' })}
      totalMinor={118_000}
      asOf="2026-11-01T10:00"
      correction={null}
      pending={false}
      error={null}
      formatInstant={formatInstant}
      onAddDenomination={() => {}}
      onPiecesChange={() => {}}
      onRemove={() => {}}
      onAsOfChange={() => {}}
      onSubmit={() => {}}
      onCancelCorrection={() => {}}
      {...overrides}
    />,
  );
}

describe('OfferingCountEntry', () => {
  it('renders one grid input per configured denomination and no quick-pick buttons', () => {
    const markup = entry({ rows: gridRows(), onCancel: () => {} });

    expect(markup).toContain('GHS notes');
    expect(markup).toContain('GHS coins');
    expect(markup.match(/aria-label="Pieces of /g)).toHaveLength(12);
    expect(markup.match(/<button/g)).toHaveLength(3);
    expect(markup).toContain('0 of 12 denominations counted; the blank rows stay visible.');
    expect(markup).toContain('Record count');
  });

  it('renders a filled grid, the live total and the counted caption', () => {
    const markup = entry();

    expect(markup).toContain('2 of 12 denominations counted; the blank rows stay visible.');
    expect(markup).toContain('Pieces of ' + money(2000));
    expect(markup).toContain('value="39"');
    expect(markup).toContain('Live total ' + money(118_000));
    expect(markup).toContain('Record count');
  });

  it('renders a one-off row with the one-off count', () => {
    const markup = entry({
      rows: gridRows({}, [{ denominationMinor: 2550, pieces: '2' }]),
      totalMinor: 5100,
      onCancel: () => {},
    });

    expect(markup).toContain('One-off rows');
    expect(markup).toContain('One-off rows: 1');
    expect(markup).toContain('Pieces of ' + money(2550));
    expect(markup).toContain(money(2550));
  });

  it('counts only positive integer pieces in the caption', () => {
    const markup = entry({ rows: gridRows({ 2000: '39', 1000: '0', 500: 'x' }) });

    expect(markup).toContain('1 of 12 denominations counted; the blank rows stay visible.');
  });

  it('names the missing catalogue and keeps the free-form add', () => {
    const markup = entry({ currency: 'USD', rows: [] });

    expect(markup).toContain('No denominations are configured for USD.');
    expect(markup).not.toContain('GHS notes');
    expect(markup).toContain('Custom denomination');
  });

  it('names an all-hidden catalogue and keeps the free-form add', () => {
    const overrides = gridDenominations('GHS').map((denomination) => ({
      denominationMinor: denomination.denominationMinor,
      enabled: false,
    }));
    const markup = entry({ overrides, rows: [] });

    expect(markup).toContain('All denominations for GHS are hidden; enter one-off rows.');
    expect(markup).not.toContain('GHS notes');
    expect(markup).not.toContain('aria-label="Pieces of ');
    expect(markup).toContain('Custom denomination');
    expect(markup).toContain('Add row');
  });

  it('marks an over-cap row and shows the local message', () => {
    const markup = entry({ rows: gridRows({ 5: '1000001' }) });

    expect(markup).toContain('A piece count must be 1,000,000 or fewer.');
    expect(markup).toContain('aria-invalid="true"');
  });

  it('renders the correction state with the kept asOf and cancel action', () => {
    const markup = entry({ correction: COUNT, onCancel: () => {} });

    expect(markup).toContain('Correct the current observation');
    expect(markup).toContain('Keeping asOf 2026-11-01T10:00:00.000Z');
    expect(markup).toContain('Save correction');
    expect(markup).toContain('Cancel');
    expect(markup).not.toContain('As of');
  });

  it('shows a form or server error in the footer without hiding the retry', () => {
    const markup = entry({ error: 'The count could not be recorded.' });

    expect(markup).toContain('The count could not be recorded.');
    expect(markup).toContain('Record count');
  });
});

describe('OfferingCountHistory', () => {
  it('renders newest first with Current and Superseded badges', () => {
    const markup = render(
      <OfferingCountHistory
        observations={[
          COUNT,
          {
            ...COUNT,
            id: 'count-0',
            totalMinor: 78_000,
            lines: [{ denominationMinor: 2000, pieces: 39 }],
            supersededBy: COUNT.id,
          },
        ]}
        currency="GHS"
        pending={false}
        formatInstant={formatInstant}
        onCorrect={() => {}}
      />,
    );

    expect(markup).toContain('Observation history');
    expect(markup).toContain('Current');
    expect(markup).toContain('Superseded');
    expect(markup).toContain(money(118_000));
    expect(markup).toContain(money(78_000));
    expect(markup).toMatch(/Correct/);
    expect(markup).toContain('never added to member or visitor gifts');
  });

  it('renders the empty state', () => {
    const markup = render(
      <OfferingCountHistory
        observations={[]}
        currency="GHS"
        pending={false}
        formatInstant={formatInstant}
        onCorrect={() => {}}
      />,
    );
    expect(markup).toContain('No offering count for this event, offering and session yet.');
  });
});

describe('AnnouncedOffertoryForm and PledgeForm', () => {
  it('renders the announced-offertory form with member numbers only', () => {
    const markup = render(
      <AnnouncedOffertoryForm
        offerings={OFFERINGS}
        defaultSessionDate="2026-11-01"
        currency="GHS"
        pending={false}
        notice={null}
        error={null}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(markup).toContain('Record offertory');
    expect(markup).toContain('Member number');
    expect(markup).toContain('Session date');
    expect(markup).toContain('Offertory');
    expect(markup).not.toContain('@');
    expect(markup).not.toContain('+233');
  });

  it('renders the pledge form with the expected date and follow-up officer', () => {
    const markup = render(
      <PledgeForm
        offerings={OFFERINGS}
        currency="GHS"
        pending={false}
        notice={null}
        error={null}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(markup).toContain('Record pledge');
    expect(markup).toContain('Expected on');
    expect(markup).toContain('Follow-up officer member no');
    expect(markup).not.toContain('@');
    expect(markup).not.toContain('+233');
  });

  it('renders the recorded and error messages', () => {
    const markup = render(
      <AnnouncedOffertoryForm
        offerings={OFFERINGS}
        defaultSessionDate="2026-11-01"
        currency="GHS"
        pending={false}
        notice="Announced offertory recorded (MR-TEST)."
        error={null}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );
    const pledgeMarkup = render(
      <PledgeForm
        offerings={OFFERINGS}
        currency="GHS"
        pending={false}
        notice={null}
        error="The member was not found."
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(markup).toContain('Announced offertory recorded');
    expect(pledgeMarkup).toContain('The member was not found.');
  });
});

describe('RecordedOffertoriesList', () => {
  it('renders the session offertories list when expanded', () => {
    const markup = render(
      <RecordedOffertoriesList
        contributions={[CONTRIBUTION]}
        offeringName="Tithe"
        currency="GHS"
        expanded
        formatInstant={(value) => value}
        onToggle={() => {}}
        onRecord={() => {}}
      />,
    );

    expect(markup).toContain('Recorded this session');
    expect(markup).toContain('M-1001');
    expect(markup).toContain('Tithe');
    expect(markup).toContain(money(50_000));
    expect(markup).toContain('View all in Offerings');
  });

  it('renders the collapsed state without the table', () => {
    const markup = render(
      <RecordedOffertoriesList
        contributions={[CONTRIBUTION]}
        offeringName="Tithe"
        currency="GHS"
        expanded={false}
        formatInstant={(value) => value}
        onToggle={() => {}}
        onRecord={() => {}}
      />,
    );

    expect(markup).toContain('Record offertory');
    expect(markup).not.toContain('M-1001');
  });
});

describe('PledgeRecordPanel', () => {
  it('records a pledge and links to the landing worklist without a session list', () => {
    const markup = render(<PledgeRecordPanel onRecord={() => {}} />);

    expect(markup).toContain('Pledges');
    expect(markup).toContain('Record pledge');
    expect(markup).toContain('Offerings pledge worklist');
    expect(markup).not.toContain('Expected on');
  });
});
