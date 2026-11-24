import { describe, expect, it } from 'vitest';
import { memberMatchesAudience, type AudienceMember } from '../../src/domain/audience-evaluator.js';
import type { AudienceRule } from '../../src/schemas/audiences.js';

/**
 * The one predicate on values alone (member-registrations-event-audience.md
 * A-3): every clause kind, the three operators, the join date and the visitor
 * gate. The counting functions are thin wrappers over this, so a clause that
 * matches here is a clause the roster counts.
 */

const DATE = '2026-06-15';

function member(overrides: Partial<AudienceMember> = {}): AudienceMember {
  return {
    joinedOn: '2020-01-01',
    dob: '1990-01-01',
    gender: 'male',
    isPresbyter: false,
    membershipStatus: 'active',
    ministryCodes: ['CHOIR'],
    ...overrides,
  };
}

const CHOIR: AudienceRule = {
  operator: 'allOf',
  clauses: [{ attribute: 'ministry', ministryCode: 'CHOIR' }],
};

describe('memberMatchesAudience clause kinds', () => {
  it('matches a ministry clause against a current active assignment, case-insensitively', () => {
    expect(memberMatchesAudience(CHOIR, member(), DATE)).toBe(true);
    expect(memberMatchesAudience(CHOIR, member({ ministryCodes: ['PRAYER'] }), DATE)).toBe(false);
    expect(memberMatchesAudience(CHOIR, member({ ministryCodes: [] }), DATE)).toBe(false);
  });

  it('matches a presbyter clause on the flag', () => {
    const rule: AudienceRule = {
      operator: 'allOf',
      clauses: [{ attribute: 'presbyter', value: true }],
    };
    expect(memberMatchesAudience(rule, member({ isPresbyter: true }), DATE)).toBe(true);
    expect(memberMatchesAudience(rule, member({ isPresbyter: false }), DATE)).toBe(false);
  });

  it('evaluates an age band as completed years at the date, inclusively', () => {
    const youth: AudienceRule = {
      operator: 'allOf',
      clauses: [{ attribute: 'ageBand', minYears: 13, maxYears: 17 }],
    };
    const thirteenthBirthday = member({ dob: '2013-06-15' });
    expect(memberMatchesAudience(youth, thirteenthBirthday, DATE)).toBe(true);

    const almostThirteen = member({ dob: '2013-06-16' });
    expect(memberMatchesAudience(youth, almostThirteen, DATE)).toBe(false);

    const eighteenthBirthday = member({ dob: '2008-06-15' });
    expect(memberMatchesAudience(youth, eighteenthBirthday, DATE)).toBe(false);

    const adults: AudienceRule = {
      operator: 'allOf',
      clauses: [{ attribute: 'ageBand', minYears: 18, maxYears: null }],
    };
    expect(memberMatchesAudience(adults, eighteenthBirthday, DATE)).toBe(true);
    expect(memberMatchesAudience(adults, member({ dob: null }), DATE)).toBe(false);
    expect(memberMatchesAudience(adults, member({ dob: '2030-01-01' }), DATE)).toBe(false);
  });

  it('matches gender against the stored value only', () => {
    const female: AudienceRule = {
      operator: 'allOf',
      clauses: [{ attribute: 'gender', value: 'female' }],
    };
    expect(memberMatchesAudience(female, member({ gender: 'female' }), DATE)).toBe(true);
    expect(memberMatchesAudience(female, member({ gender: 'male' }), DATE)).toBe(false);
    expect(memberMatchesAudience(female, member({ gender: 'other' }), DATE)).toBe(false);
    expect(memberMatchesAudience(female, member({ gender: 'undisclosed' }), DATE)).toBe(false);
  });

  it('matches membership status', () => {
    const active: AudienceRule = {
      operator: 'allOf',
      clauses: [{ attribute: 'membershipStatus', value: 'active' }],
    };
    expect(memberMatchesAudience(active, member(), DATE)).toBe(true);
    expect(memberMatchesAudience(active, member({ membershipStatus: 'visitor' }), DATE)).toBe(
      false,
    );
  });
});

describe('memberMatchesAudience operators', () => {
  it('requires every clause for allOf', () => {
    const rule: AudienceRule = {
      operator: 'allOf',
      clauses: [
        { attribute: 'ministry', ministryCode: 'CHOIR' },
        { attribute: 'presbyter', value: true },
      ],
    };
    expect(memberMatchesAudience(rule, member({ isPresbyter: true }), DATE)).toBe(true);
    expect(memberMatchesAudience(rule, member({ isPresbyter: false }), DATE)).toBe(false);
    expect(
      memberMatchesAudience(rule, member({ isPresbyter: true, ministryCodes: [] }), DATE),
    ).toBe(false);
  });

  it('requires one clause for anyOf', () => {
    const rule: AudienceRule = {
      operator: 'anyOf',
      clauses: [
        { attribute: 'ageBand', minYears: 0, maxYears: 12 },
        { attribute: 'ageBand', minYears: 13, maxYears: 17 },
      ],
    };
    expect(memberMatchesAudience(rule, member({ dob: '2015-01-01' }), DATE)).toBe(true);
    expect(memberMatchesAudience(rule, member({ dob: '1990-01-01' }), DATE)).toBe(false);
  });

  it('matches none of the clauses for noneOf, not the negation of the whole rule', () => {
    const rule: AudienceRule = {
      operator: 'noneOf',
      clauses: [{ attribute: 'ministry', ministryCode: 'CHOIR' }],
    };
    expect(memberMatchesAudience(rule, member({ ministryCodes: [] }), DATE)).toBe(true);
    expect(memberMatchesAudience(rule, member(), DATE)).toBe(false);
  });
});

describe('memberMatchesAudience join date and the visitor gate', () => {
  it('excludes a member who joins after the evaluation date', () => {
    expect(memberMatchesAudience(CHOIR, member({ joinedOn: '2026-06-16' }), DATE)).toBe(false);
    expect(memberMatchesAudience(CHOIR, member({ joinedOn: DATE }), DATE)).toBe(true);
  });

  it('matches a registered visitor only when the rule names the visitor status', () => {
    const visitor = member({ membershipStatus: 'visitor', isPresbyter: true });
    expect(memberMatchesAudience(CHOIR, visitor, DATE)).toBe(false);

    const choirOrVisitors: AudienceRule = {
      operator: 'anyOf',
      clauses: [
        { attribute: 'ministry', ministryCode: 'CHOIR' },
        { attribute: 'membershipStatus', value: 'visitor' },
      ],
    };
    expect(memberMatchesAudience(choirOrVisitors, visitor, DATE)).toBe(true);
    // `noneOf(ministry)` does not name the visitor status, so the visitor
    // matches nothing even though they hold no excluded ministry.
    const exceptChoir: AudienceRule = {
      operator: 'noneOf',
      clauses: [{ attribute: 'ministry', ministryCode: 'CHOIR' }],
    };
    expect(
      memberMatchesAudience(
        exceptChoir,
        member({ membershipStatus: 'visitor', ministryCodes: [] }),
        DATE,
      ),
    ).toBe(false);
  });
});
