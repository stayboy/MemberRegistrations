import { describe, expect, it } from 'vitest';
import {
  attendanceDescription,
  contactLabel,
  formatAttendance,
  memberInitials,
  memberLabel,
  memberName,
  subscriptionDescription,
  subscriptionLabel,
} from './member';

describe('formatAttendance', () => {
  it('uses the agreed counts plus last date form', () => {
    expect(formatAttendance({ attended: 4, expected: 5, lastAttendedOn: '2026-10-26' })).toBe(
      '4/5 (26-Oct-26)',
    );
  });

  it('keeps the compact FR-76 form under a non-default display preference', () => {
    // The attendance exception takes no preference argument; 26-Oct-26 is fixed
    // by FR-76/AC-41 and the date/time spec's documented exception.
    expect(formatAttendance({ attended: 4, expected: 5, lastAttendedOn: '2026-10-26' })).toBe(
      '4/5 (26-Oct-26)',
    );
  });

  it('drops the parentheses when there is no last date', () => {
    expect(formatAttendance({ attended: 4, expected: 5, lastAttendedOn: null })).toBe('4/5');
    expect(formatAttendance({ attended: 0, expected: 5 })).toBe('0/5');
  });

  it('never emits a second date line', () => {
    const rendered = formatAttendance({
      attended: 4,
      expected: 5,
      lastAttendedOn: '2026-10-26',
    });
    expect(rendered.split('\n')).toHaveLength(1);
    expect(rendered.match(/26-Oct-26/g)).toHaveLength(1);
  });

  it('distinguishes no data from zero attendance', () => {
    expect(formatAttendance(null)).toBe('No attendance yet');
    expect(formatAttendance(undefined)).toBe('No attendance yet');
  });
});

describe('attendanceDescription', () => {
  it('names the series and the full last-attended date', () => {
    expect(
      attendanceDescription({
        seriesName: 'Sunday Main',
        attended: 4,
        expected: 5,
        lastAttendedOn: '2026-10-26',
      }),
    ).toBe('Sunday Main · 4 of 5 attended · last attended 26 October 2026');
  });

  it('handles no aggregate, no series name and no last date', () => {
    expect(attendanceDescription(null)).toBe('No attendance yet');
    expect(attendanceDescription({ attended: 4, expected: 5, lastAttendedOn: null })).toBe(
      '4 of 5 attended · no attendance recorded',
    );
  });
});

describe('contactLabel', () => {
  it('formats the count without pluralising the column label', () => {
    expect(contactLabel(0)).toBe('Contacts · 0');
    expect(contactLabel(1)).toBe('Contacts · 1');
    expect(contactLabel(3)).toBe('Contacts · 3');
  });

  it('clamps nonsense counts to zero', () => {
    expect(contactLabel(-2)).toBe('Contacts · 0');
    expect(contactLabel(Number.NaN)).toBe('Contacts · 0');
  });
});

describe('memberName', () => {
  it('joins the first and last name', () => {
    expect(memberName({ firstName: 'Ama', lastName: 'Mensah', otherNames: null })).toBe(
      'Ama Mensah',
    );
  });

  it('falls back to other names when the names are blank', () => {
    expect(memberName({ firstName: ' ', lastName: '', otherNames: 'Kofi Boateng' })).toBe(
      'Kofi Boateng',
    );
  });

  it('returns an empty string when every name is blank', () => {
    expect(memberName({ firstName: '', lastName: '', otherNames: null })).toBe('');
  });
});

describe('memberInitials', () => {
  it('uses the first letter of each name', () => {
    expect(memberInitials({ firstName: 'Kofi', lastName: 'Appiah' })).toBe('KA');
    expect(memberInitials({ firstName: '', lastName: '' })).toBe('?');
  });
});

describe('memberLabel', () => {
  it('composes the shared FullName (Gender, Ny) label', () => {
    expect(
      memberLabel({ firstName: 'Ama', lastName: 'Mensah', gender: 'female', age: 32 }),
    ).toBe('Ama Mensah (Female, 32y)');
    expect(memberLabel({ firstName: 'Kofi', lastName: 'Owusu', gender: 'male', age: 7 })).toBe(
      'Kofi Owusu (Male, 7y)',
    );
  });

  it('omits an undisclosed gender without a placeholder', () => {
    expect(
      memberLabel({ firstName: 'Ama', lastName: 'Mensah', gender: 'undisclosed', age: 32 }),
    ).toBe('Ama Mensah (32y)');
  });

  it('omits a null or missing age without a placeholder', () => {
    expect(memberLabel({ firstName: 'Ama', lastName: 'Mensah', gender: 'female', age: null })).toBe(
      'Ama Mensah (Female)',
    );
    expect(memberLabel({ firstName: 'Ama', lastName: 'Mensah', gender: 'female' })).toBe(
      'Ama Mensah (Female)',
    );
  });

  it('returns the plain name when both parts are absent', () => {
    expect(memberLabel({ firstName: 'Ama', lastName: 'Mensah' })).toBe('Ama Mensah');
    expect(
      memberLabel({ firstName: 'Ama', lastName: 'Mensah', gender: 'undisclosed', age: null }),
    ).toBe('Ama Mensah');
  });

  it('never uses otherNames, alias or maidenName', () => {
    expect(
      memberLabel({
        firstName: '',
        lastName: '',
        otherNames: 'Akosua',
        gender: 'female',
        age: 30,
      }),
    ).toBe('Akosua (Female, 30y)');
    expect(
      memberLabel({ firstName: 'Ama', lastName: 'Mensah', otherNames: 'Adwoa' }),
    ).toBe('Ama Mensah');
  });

  it('returns an empty string for a blank name', () => {
    expect(memberLabel({ firstName: '', lastName: '', gender: 'female', age: 32 })).toBe('');
  });
});

describe('subscriptions', () => {
  it('shows only the kind as the pill label', () => {
    expect(subscriptionLabel('life_insurance')).toBe('Life');
    expect(subscriptionLabel('credit_union')).toBe('Credit union');
  });

  it('puts scope, role, coverage and status in the description', () => {
    expect(
      subscriptionDescription({
        kind: 'life_insurance',
        scope: 'household',
        status: 'active',
        role: 'policyholder',
        coveredCount: 3,
      }),
    ).toBe('Life · Household · Policyholder · 3 covered members · Active');
    expect(
      subscriptionDescription({
        kind: 'credit_union',
        scope: 'individual',
        status: 'ended',
        role: 'covered',
        coveredCount: 0,
      }),
    ).toBe('Credit union · Individual · Covered · No coverage · Ended');
  });
});
