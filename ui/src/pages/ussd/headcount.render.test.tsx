import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Headcount } from '../../api/ussd';
import { headcountFormFrom } from '../../format/ussd';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { HeadcountDialogFields } from './HeadcountDialogs';
import { HeadcountReadFirst } from './HeadcountReadFirst';

const formatInstant = (value: string): string => value;

const CURRENT: Headcount = {
  id: 'headcount-2',
  eventId: 'event-1',
  sessionDate: '2026-11-08',
  asOf: '2026-11-08T10:42:00.000Z',
  mode: 'adults',
  adultMale: 62,
  adultFemale: 71,
  adultUnspecified: 0,
  childMale: 0,
  childFemale: 0,
  childUnspecified: 9,
  total: 142,
  ended: false,
  recordedBy: 'demo.officer',
  recordedAt: '2026-11-08T10:44:00.000Z',
  supersedesId: 'headcount-1',
  supersededBy: null,
};

const SUPERSEDED: Headcount = {
  ...CURRENT,
  id: 'headcount-1',
  asOf: '2026-11-08T09:58:00.000Z',
  adultMale: 41,
  adultFemale: 52,
  childUnspecified: 6,
  total: 99,
  recordedAt: '2026-11-08T10:00:00.000Z',
  supersedesId: null,
  supersededBy: CURRENT.id,
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
  });

  it('shows four numbers and no unspecified buckets in Mixed service', () => {
    const markup = fields({ mode: 'mixed' });

    expect(markup).toContain('Adult men');
    expect(markup).toContain('Adult women');
    expect(markup).toContain('Boys');
    expect(markup).toContain('Girls');
    expect(markup).not.toContain('>Children</label>');
    expect(markup).not.toContain('>Adults</label>');
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
        current={CURRENT}
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
    expect(markup).toContain('142');
    expect(markup).toContain('Roster');
    expect(markup).toContain('160');
    expect(markup).toContain('Register-derived attendance. Never merged with the headcount.');
    expect(markup).toContain('Observation history');
    expect(markup).toContain('Current');
    expect(markup).toContain('Superseded');
    expect(markup).toContain('AM 62 · AF 71 · C? 9');
    expect(markup).toContain('Valid for 2026-11-08T09:58:00.000Z');
    expect(markup).toContain('Correct');
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('<form');
    expect(markup).not.toContain('Record a headcount');
  });

  it('offers Correct only on the current row when two uncorrected records exist', () => {
    const older: Headcount = {
      ...CURRENT,
      id: 'headcount-0',
      asOf: '2026-11-08T10:30:00.000Z',
      recordedAt: '2026-11-08T10:31:00.000Z',
      supersedesId: null,
      supersededBy: null,
    };
    const markup = render(
      <HeadcountReadFirst
        current={CURRENT}
        observations={[CURRENT, older]}
        roster={160}
        rosterPending={false}
        rosterError={false}
        pending={false}
        formatInstant={formatInstant}
        onCorrect={() => {}}
      />,
    );

    // One Correct on the current card, one on the current row — never a third
    // on the older non-superseded row, whose submit the API would reject.
    expect(markup.match(/Correct/g)?.length).toBe(2);
    expect(markup).toContain('Earlier');
    expect(markup).toContain('Valid for 2026-11-08T10:30:00.000Z');
  });

  it('renders the empty current card and history state', () => {
    const markup = render(
      <HeadcountReadFirst
        current={null}
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
