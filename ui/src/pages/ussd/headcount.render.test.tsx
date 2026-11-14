import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Headcount, HeadcountLine } from '../../api/ussd';
import { headcountFormFrom } from '../../format/ussd';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { HeadcountDialogFields } from './HeadcountDialogs';
import { HeadcountReadFirst } from './HeadcountReadFirst';

const formatInstant = (value: string): string => value;

const ADULT_LINES: readonly HeadcountLine[] = [
  { code: 'adult-male', label: 'Adult men', count: 62 },
  { code: 'adult-female', label: 'Adult women', count: 71 },
  { code: 'child-unspecified', label: 'Children', count: 9 },
];

const CURRENT: Headcount = {
  id: 'headcount-2',
  eventId: 'event-1',
  sessionDate: '2026-11-08',
  asOf: '2026-11-08T10:42:00.000Z',
  mode: 'adults',
  total: 142,
  ended: false,
  recordedBy: 'demo.officer',
  recordedAt: '2026-11-08T10:44:00.000Z',
  supersedesId: 'headcount-1',
  supersededBy: null,
  lines: ADULT_LINES,
};

const SUPERSEDED: Headcount = {
  ...CURRENT,
  id: 'headcount-1',
  asOf: '2026-11-08T09:58:00.000Z',
  total: 99,
  recordedAt: '2026-11-08T10:00:00.000Z',
  supersedesId: null,
  supersededBy: CURRENT.id,
  lines: [
    { code: 'adult-male', label: 'Adult men', count: 41 },
    { code: 'adult-female', label: 'Adult women', count: 52 },
    { code: 'child-unspecified', label: 'Children', count: 6 },
  ],
};

const CHILDREN: Headcount = {
  ...CURRENT,
  id: 'headcount-3',
  mode: 'children',
  asOf: '2026-11-08T10:50:00.000Z',
  total: 18,
  recordedAt: '2026-11-08T10:52:00.000Z',
  supersedesId: null,
  lines: [
    { code: 'child-male', label: 'Boys', count: 5 },
    { code: 'child-female', label: 'Girls', count: 6 },
    { code: 'adult-unspecified', label: 'Adults', count: 7 },
  ],
};

function render(node: ReactElement): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ThemeProvider>{node}</ThemeProvider>
    </MemoryRouter>,
  );
}

function fields(overrides: Partial<Parameters<typeof HeadcountDialogFields>[0]> = {}): string {
  return render(
    <HeadcountDialogFields
      correction={null}
      mode="adults"
      values={headcountFormFrom(CURRENT)}
      asOf="2026-11-08T10:42"
      pending={false}
      formatInstant={formatInstant}
      onModeChange={() => {}}
      onValueChange={() => {}}
      onAsOfChange={() => {}}
      {...overrides}
    />,
  );
}

describe('HeadcountDialogFields', () => {
  it('records three numbers in Adult service with an editable asOf', () => {
    const markup = fields();

    expect(markup).toContain('Adult service');
    expect(markup).toContain('As of');
    expect(markup).toContain('Defaults to now');
    expect(markup).toContain('Adult men');
    expect(markup).toContain('Adult women');
    expect(markup).toContain('>Children</label>');
    expect(markup).toContain('value="62"');
    expect(markup).toContain('type="datetime-local"');
    expect(markup).not.toContain('Keeping asOf');
    expect(markup).not.toContain('Mixed service');
  });

  it('records Boys, Girls and Adults in Children service', () => {
    const markup = fields({ mode: 'children', values: headcountFormFrom(CHILDREN) });

    expect(markup).toContain('Children service');
    expect(markup).toContain('Boys');
    expect(markup).toContain('Girls');
    expect(markup).toContain('>Adults</label>');
    expect(markup).toContain('value="5"');
    expect(markup).not.toContain('>Children</label>');
    expect(markup).not.toContain('Mixed service');
  });

  it('corrects the current observation with the kept asOf and no date input', () => {
    const markup = fields({ correction: CURRENT });

    expect(markup).toContain('Keeping asOf 2026-11-08T10:42:00.000Z');
    expect(markup).toContain('The correction keeps 2026-11-08T10:42:00.000Z');
    expect(markup).toContain('value="62"');
    expect(markup).toContain('value="9"');
    expect(markup).not.toContain('type="datetime-local"');
    expect(markup).not.toContain('Defaults to now');
  });
});

describe('HeadcountReadFirst', () => {
  it('is read-first: no record form or inputs, only the Current and row Correct actions', () => {
    const markup = render(
      <HeadcountReadFirst
        current={{ adults: CURRENT }}
        lane="adults"
        observations={[CURRENT, SUPERSEDED]}
        roster={160}
        rosterPending={false}
        rosterError={false}
        pending={false}
        formatInstant={formatInstant}
        onCorrect={() => {}}
      />,
    );

    expect(markup).toContain('Current headcount');
    expect(markup).toContain('Adult service');
    expect(markup).toContain('142');
    expect(markup).toContain('Roster');
    expect(markup).toContain('160');
    expect(markup).toContain('Register-derived attendance. Never merged with the headcount.');
    expect(markup).toContain('Observation history');
    expect(markup).toContain('Current');
    expect(markup).toContain('Superseded');
    expect(markup).toContain('Adult men 62 · Adult women 71 · Children 9');
    expect(markup).toContain('Valid for 2026-11-08T09:58:00.000Z');
    expect(markup).toContain('Correct');
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('<form');
    expect(markup).not.toContain('Record a headcount');
  });

  it('reads one lane but marks every lane’s own current row', () => {
    const markup = render(
      <HeadcountReadFirst
        current={{ adults: CURRENT, children: CHILDREN }}
        lane="adults"
        observations={[CHILDREN, CURRENT, SUPERSEDED]}
        roster={160}
        rosterPending={false}
        rosterError={false}
        pending={false}
        formatInstant={formatInstant}
        onCorrect={() => {}}
      />,
    );

    // One Correct on the adults card, one on each lane's current history row.
    expect(markup.match(/Correct/g)?.length).toBe(3);
    // `>Current<` is the history badge; the card header reads "Current headcount · …".
    expect(markup.match(/>Current</g)?.length).toBe(2);
    expect(markup).toContain('Valid for 2026-11-08T09:58:00.000Z');
  });

  it('renders the named lane empty even when another lane has a count', () => {
    const markup = render(
      <HeadcountReadFirst
        current={{ adults: null, children: CHILDREN }}
        lane="adults"
        observations={[CHILDREN]}
        roster={160}
        rosterPending={false}
        rosterError={false}
        pending={false}
        formatInstant={formatInstant}
        onCorrect={() => {}}
      />,
    );

    expect(markup).toContain('No headcount recorded for this session yet.');
    expect(markup).toContain('Current');
  });

  it('renders the empty history state', () => {
    const markup = render(
      <HeadcountReadFirst
        current={{}}
        lane="adults"
        observations={[]}
        roster={160}
        rosterPending={false}
        rosterError={false}
        pending={false}
        formatInstant={formatInstant}
        onCorrect={() => {}}
      />,
    );

    expect(markup).toContain('No headcount recorded for this session yet.');
    expect(markup).toContain('No observation for this session yet.');
  });
});
