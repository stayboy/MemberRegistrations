import { describe, expect, it } from 'vitest';
import {
  addCoveredMemberNo,
  coverageCountLabel,
  coveredMemberNosLabel,
  createEmptySubscriptionForm,
  subscriptionKindLabel,
  subscriptionRoleLabel,
  subscriptionScopeLabel,
  subscriptionStatusLabel,
  toSubscriptionPayload,
  validateCoverageMemberNo,
  validateSubscriptionForm,
  type SubscriptionFormValues,
} from './subscription';

const valid: SubscriptionFormValues = {
  kind: 'life_insurance',
  scope: 'household',
  reference: 'POL-8842',
  startedOn: '2026-11-04',
  coveredMemberNos: [],
};

describe('subscription labels', () => {
  it('names each kind, scope, role and status', () => {
    expect(subscriptionKindLabel('life_insurance')).toBe('Life insurance');
    expect(subscriptionKindLabel('credit_union')).toBe('Credit union');
    expect(subscriptionScopeLabel('individual')).toBe('Individual');
    expect(subscriptionScopeLabel('household')).toBe('Household');
    expect(subscriptionRoleLabel('policyholder')).toBe('Policyholder');
    expect(subscriptionRoleLabel('covered')).toBe('Covered');
    expect(subscriptionStatusLabel('active')).toBe('Active');
    expect(subscriptionStatusLabel('ended')).toBe('Ended');
  });

  it('falls back to an em dash for an unset choice', () => {
    expect(subscriptionKindLabel('')).toBe('—');
    expect(subscriptionScopeLabel('')).toBe('—');
  });
});

describe('createEmptySubscriptionForm', () => {
  it('defaults startedOn to the supplied UTC date', () => {
    expect(createEmptySubscriptionForm('2026-11-04')).toEqual({
      kind: 'life_insurance',
      scope: 'individual',
      reference: '',
      startedOn: '2026-11-04',
      coveredMemberNos: [],
    });
  });
});

describe('validateSubscriptionForm', () => {
  it('accepts the documented form', () => {
    expect(validateSubscriptionForm(valid)).toEqual({});
  });

  it('requires kind and scope', () => {
    expect(validateSubscriptionForm({ ...valid, kind: '', scope: '' })).toEqual({
      kind: 'Kind is required.',
      scope: 'Scope is required.',
    });
  });

  it('requires a real ISO startedOn date', () => {
    expect(validateSubscriptionForm({ ...valid, startedOn: '' })).toEqual({
      startedOn: 'Started on is required.',
    });
    expect(validateSubscriptionForm({ ...valid, startedOn: '2026-1-1' })).toEqual({
      startedOn: 'Started on must be a real date in YYYY-MM-DD form.',
    });
    expect(validateSubscriptionForm({ ...valid, startedOn: '2026-02-30' })).toEqual({
      startedOn: 'Started on must be a real date in YYYY-MM-DD form.',
    });
  });

  it('limits the reference to 100 characters after trimming', () => {
    expect(validateSubscriptionForm({ ...valid, reference: '   ' })).toEqual({});
    expect(validateSubscriptionForm({ ...valid, reference: 'x'.repeat(100) })).toEqual({});
    expect(validateSubscriptionForm({ ...valid, reference: ` ${'x'.repeat(101)} ` })).toEqual({
      reference: 'Reference must be 100 characters or fewer.',
    });
  });

  it('rejects a malformed covered member number for household scope', () => {
    expect(validateSubscriptionForm({ ...valid, coveredMemberNos: ['M 1002'] })).toEqual({
      coveredMemberNos:
        'Member number must be 1-32 characters and contain only letters, digits, hyphens or underscores.',
    });
  });

  it('ignores coverage values that individual scope never sends', () => {
    expect(
      validateSubscriptionForm({ ...valid, scope: 'individual', coveredMemberNos: ['M 1002'] }),
    ).toEqual({});
  });
});

describe('toSubscriptionPayload', () => {
  it('trims the reference and started date', () => {
    expect(
      toSubscriptionPayload({
        ...valid,
        reference: '  POL-8842  ',
        startedOn: ' 2026-11-04 ',
      }),
    ).toEqual({
      kind: 'life_insurance',
      scope: 'household',
      reference: 'POL-8842',
      startedOn: '2026-11-04',
      coveredMemberNos: [],
    });
  });

  it('sends a blank reference as null', () => {
    expect(toSubscriptionPayload({ ...valid, reference: '   ' }).reference).toBeNull();
  });

  it('omits coveredMemberNos for individual scope', () => {
    expect(
      toSubscriptionPayload({ ...valid, scope: 'individual', coveredMemberNos: ['M-1002'] }),
    ).not.toHaveProperty('coveredMemberNos');
  });

  it('carries coveredMemberNos for household scope', () => {
    expect(
      toSubscriptionPayload({ ...valid, coveredMemberNos: ['M-1002', 'M-1003'] }),
    ).toMatchObject({
      scope: 'household',
      coveredMemberNos: ['M-1002', 'M-1003'],
    });
  });

  it('refuses to build a payload without kind or scope', () => {
    expect(() => toSubscriptionPayload({ ...valid, kind: '' })).toThrow(
      'Subscription kind and scope are required.',
    );
  });
});

describe('addCoveredMemberNo', () => {
  it('adds a trimmed member number to the draft', () => {
    expect(addCoveredMemberNo([], ' M-1002 ')).toEqual({
      memberNos: ['M-1002'],
      error: null,
    });
  });

  it('rejects an empty entry without adding it', () => {
    expect(addCoveredMemberNo(['M-1002'], '   ')).toEqual({
      memberNos: ['M-1002'],
      error: 'Member number is required.',
    });
  });

  it('rejects a malformed entry without adding it', () => {
    const result = addCoveredMemberNo([], 'M 1002');

    expect(result.memberNos).toEqual([]);
    expect(result.error).toMatch(/1-32 characters/);
  });

  it('rejects a duplicate without adding it', () => {
    expect(addCoveredMemberNo(['M-1002'], 'M-1002')).toEqual({
      memberNos: ['M-1002'],
      error: 'M-1002 is already covered by this policy.',
    });
  });
});

describe('coverage member numbers', () => {
  it('accepts a member number with letters, digits, hyphens or underscores', () => {
    expect(validateCoverageMemberNo('M-1002')).toBeNull();
    expect(validateCoverageMemberNo(' m_1002 ')).toBeNull();
  });

  it('rejects an empty, malformed or overlong member number', () => {
    expect(validateCoverageMemberNo('   ')).toBe('Member number is required.');
    expect(validateCoverageMemberNo('-M-1002')).toMatch(/1-32 characters/);
    expect(validateCoverageMemberNo('M 1002')).toMatch(/1-32 characters/);
    expect(validateCoverageMemberNo('M'.repeat(33))).toMatch(/1-32 characters/);
  });

  it('labels the covered count without inventing a policy', () => {
    expect(coverageCountLabel(0)).toBe('No covered members');
    expect(coverageCountLabel(1)).toBe('1 covered member');
    expect(coverageCountLabel(3)).toBe('3 covered members');
    expect(coverageCountLabel(Number.NaN)).toBe('No covered members');
  });

  it('labels the covered values from the API list', () => {
    expect(coveredMemberNosLabel([])).toBe('No coverage');
    expect(coveredMemberNosLabel(['M-1002', 'M-1003'])).toBe('M-1002, M-1003');
  });
});
