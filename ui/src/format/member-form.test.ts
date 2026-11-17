import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import type { MemberDetail, MemberDetailResult } from '../api/members';
import {
  contactConflictErrors,
  createEmptyMemberForm,
  fromMemberDetail,
  isStaleConflictError,
  memberNoConflictMessage,
  mergeKeptValues,
  subscriptionPayerError,
  toCreatePayload,
  toSubscriptionInput,
  toUpdatePayload,
  utcToday,
  validateMemberForm,
  validateSubscriptionDraft,
} from './member-form';

function detail(overrides: Partial<MemberDetail> = {}): MemberDetail {
  return {
    id: 'member-1',
    memberNo: 'M-1001',
    firstName: 'Ama',
    lastName: 'Mensah',
    otherNames: null,
    maidenName: null,
    alias: null,
    dob: null,
    gender: 'female',
    age: null,
    ageMonths: null,
    placeOfResidence: 'Adenta',
    addressLine: null,
    joinedOn: '2026-01-04',
    isPresbyter: true,
    archivedAt: null,
    purgedAt: null,
    contactCount: 1,
    ministries: [],
    version: 3,
    createdAt: '2026-01-04T00:00:00.000Z',
    updatedAt: '2026-01-04T00:00:00.000Z',
    contacts: [],
    subscriptions: [],
    relationships: [],
    attendance: [],
    ...overrides,
  };
}

describe('validateMemberForm', () => {
  it('requires the member number and both names', () => {
    const errors = validateMemberForm(createEmptyMemberForm('2026-11-04'));
    expect(errors.memberNo).toBeDefined();
    expect(errors.firstName).toBeDefined();
    expect(errors.lastName).toBeDefined();
  });

  it('mirrors the member-number and date constraints', () => {
    const errors = validateMemberForm({
      ...createEmptyMemberForm('2026-11-04'),
      memberNo: '-bad number',
      firstName: 'Ama',
      lastName: 'Mensah',
      dob: '2026-02-30',
      joinedOn: '04/11/2026',
    });

    expect(errors.memberNo).toBeDefined();
    expect(errors.dob).toBeDefined();
    expect(errors.joinedOn).toBeDefined();
  });

  it('accepts a valid form, including empty optional dates', () => {
    const errors = validateMemberForm({
      ...createEmptyMemberForm('2026-11-04'),
      memberNo: 'M-1009',
      firstName: 'Kofi',
      lastName: 'Mensah',
      dob: '',
      joinedOn: '',
    });

    expect(errors).toEqual({});
  });

  it('enforces the API text limits', () => {
    const errors = validateMemberForm({
      ...createEmptyMemberForm('2026-11-04'),
      memberNo: 'M-1009',
      firstName: 'Kofi',
      lastName: 'Mensah',
      otherNames: 'x'.repeat(201),
      addressLine: 'x'.repeat(301),
    });

    expect(errors.otherNames).toBeDefined();
    expect(errors.addressLine).toBeDefined();
  });

  it('mirrors the API contact constraints on the three optional fields', () => {
    const errors = validateMemberForm({
      ...createEmptyMemberForm('2026-11-04'),
      memberNo: 'M-1009',
      firstName: 'Kofi',
      lastName: 'Mensah',
      phone: '12',
      email: 'not-an-address',
      whatsapp: 'x'.repeat(257),
    });

    expect(errors.phone).toBeDefined();
    expect(errors.email).toBeDefined();
    expect(errors.whatsapp).toBeDefined();
  });
});

describe('createEmptyMemberForm', () => {
  it('defaults the join date to UTC today and gender to undisclosed', () => {
    const form = createEmptyMemberForm('2026-11-04');
    expect(form.joinedOn).toBe('2026-11-04');
    expect(form.gender).toBe('undisclosed');
    expect(form.isPresbyter).toBe(false);
  });

  it('formats the current UTC date without a local-time shift', () => {
    expect(utcToday(new Date('2026-11-04T23:30:00.000Z'))).toBe('2026-11-04');
    expect(utcToday(new Date('2026-11-05T00:30:00.000Z'))).toBe('2026-11-05');
  });
});

describe('toCreatePayload', () => {
  it('trims required text and turns blank optionals into null', () => {
    const payload = toCreatePayload({
      ...createEmptyMemberForm('2026-11-04'),
      memberNo: ' M-1009 ',
      firstName: ' Kofi ',
      lastName: ' Mensah ',
      otherNames: ' ',
      alias: 'K',
      dob: '',
      placeOfResidence: ' Adenta ',
    });

    expect(payload.memberNo).toBe('M-1009');
    expect(payload.firstName).toBe('Kofi');
    expect(payload.lastName).toBe('Mensah');
    expect(payload.otherNames).toBeNull();
    expect(payload.alias).toBe('K');
    expect(payload.dob).toBeNull();
    expect(payload.placeOfResidence).toBe('Adenta');
    expect(payload.gender).toBe('undisclosed');
  });
});

describe('toUpdatePayload', () => {
  it('only sends fields that changed', () => {
    const original = fromMemberDetail(detail());
    const changed = { ...original, firstName: 'Ama', alias: 'Ama M' };

    expect(toUpdatePayload(changed, original)).toEqual({ alias: 'Ama M' });
  });

  it('returns an empty payload when nothing changed', () => {
    const original = fromMemberDetail(detail());
    expect(toUpdatePayload({ ...original }, original)).toEqual({});
  });

  it('detects a cleared optional field as a change', () => {
    const original = fromMemberDetail(detail());
    const changed = { ...original, placeOfResidence: '' };
    expect(toUpdatePayload(changed, original)).toEqual({ placeOfResidence: null });
  });

  it('never sends contacts: the edit form has none (FR-29a)', () => {
    const original = fromMemberDetail(detail());
    const changed = { ...original, phone: '+233 24 555 0109', email: 'ama@example.test' };
    expect(toUpdatePayload(changed, original)).toEqual({});
  });
});

describe('contacts on the create body (FR-29a)', () => {
  it('makes one row per entered value in the section order and skips blanks', () => {
    const payload = toCreatePayload({
      ...createEmptyMemberForm('2026-11-04'),
      memberNo: 'M-1009',
      firstName: 'Kofi',
      lastName: 'Mensah',
      phone: ' +233 24 555 0109 ',
      whatsapp: '+233 20 000 0009',
    });

    expect(payload.contacts).toEqual([
      { kind: 'phone', value: '+233 24 555 0109' },
      { kind: 'whatsapp', value: '+233 20 000 0009' },
    ]);
  });

  it('omits the contacts key entirely when every value is blank', () => {
    const payload = toCreatePayload({
      ...createEmptyMemberForm('2026-11-04'),
      memberNo: 'M-1009',
      firstName: 'Kofi',
      lastName: 'Mensah',
    });

    expect(payload).not.toHaveProperty('contacts');
  });
});

describe('ministries on the create body (FR-71)', () => {
  it('sends the chosen ministry codes and omits the key when none is chosen', () => {
    const withMinistries = toCreatePayload({
      ...createEmptyMemberForm('2026-11-04'),
      memberNo: 'M-1009',
      firstName: 'Kofi',
      lastName: 'Mensah',
      ministries: ['CHOIR', 'USHER'],
    });
    expect(withMinistries.ministries).toEqual(['CHOIR', 'USHER']);

    const without = toCreatePayload({
      ...createEmptyMemberForm('2026-11-04'),
      memberNo: 'M-1009',
      firstName: 'Kofi',
      lastName: 'Mensah',
    });
    expect(without).not.toHaveProperty('ministries');
  });

  it('keeps ministries off the update body', () => {
    const original = fromMemberDetail(detail());
    const changed = { ...original, ministries: ['CHOIR'] };
    expect(toUpdatePayload(changed, original)).toEqual({});
  });
});

describe('the create form subscription (FR-29a)', () => {
  it('builds no follow-up body when no product was chosen', () => {
    expect(toSubscriptionInput(createEmptyMemberForm('2026-11-04'))).toBeNull();
  });

  it('sends the product alone when the product names its payer', () => {
    expect(
      toSubscriptionInput({
        ...createEmptyMemberForm('2026-11-04'),
        subscriptionProductCode: 'FUNERAL',
      }),
    ).toEqual({ productCode: 'FUNERAL' });
  });

  it('sends the payer when the operator chose one', () => {
    expect(
      toSubscriptionInput({
        ...createEmptyMemberForm('2026-11-04'),
        subscriptionProductCode: 'HEALTH',
        subscriptionPaidBy: 'church',
      }),
    ).toEqual({ productCode: 'HEALTH', paidBy: 'church' });
  });

  it('asks for a payer only when the product allows either, and blocks until it is chosen', () => {
    expect(subscriptionPayerError('member', '')).toBeNull();
    expect(subscriptionPayerError('church', '')).toBeNull();

    const values = {
      ...createEmptyMemberForm('2026-11-04'),
      subscriptionProductCode: 'HEALTH',
    };
    expect(validateSubscriptionDraft(values, 'either')).toEqual({
      subscriptionPaidBy: 'Choose who pays for this product.',
    });
    expect(
      validateSubscriptionDraft({ ...values, subscriptionPaidBy: 'member' }, 'either'),
    ).toEqual({});
    // No product chosen means no subscription error at all.
    expect(validateSubscriptionDraft(createEmptyMemberForm('2026-11-04'), 'either')).toEqual({});
  });
});

describe('contactConflictErrors', () => {
  it('puts a 409 that quotes an entered value against that field', () => {
    const values = {
      ...createEmptyMemberForm('2026-11-04'),
      phone: '+233 20 000 0002',
      email: 'Kofi@Example.test',
    };

    expect(
      contactConflictErrors(
        new ApiError(409, 'Contact value "kofi@example.test" already belongs to a member'),
        values,
      ),
    ).toEqual({ email: 'Contact value "kofi@example.test" already belongs to a member' });

    expect(
      contactConflictErrors(
        new ApiError(409, 'Contact value "+233 20 000 0002" already belongs to a member'),
        values,
      ),
    ).toEqual({ phone: 'Contact value "+233 20 000 0002" already belongs to a member' });
  });

  it('leaves a duplicate member number to the member-number field', () => {
    const values = { ...createEmptyMemberForm('2026-11-04'), phone: '+233 24 555 0109' };

    expect(
      contactConflictErrors(
        new ApiError(409, 'A member with number M-1001 already exists'),
        values,
      ),
    ).toBeNull();
  });
});

describe('mergeKeptValues', () => {
  const latest: MemberDetailResult = {
    member: detail({ version: 5, firstName: 'Akosua' }),
    etag: '"v5"',
  };

  it('takes the freshly read ETag so the next save is accepted', () => {
    expect(mergeKeptValues(latest, fromMemberDetail(detail())).etag).toBe('"v5"');
  });

  it('keeps the operator values for the editable fields', () => {
    const kept = { ...fromMemberDetail(detail()), firstName: 'Kofi', alias: 'K' };
    const merged = mergeKeptValues(latest, kept);

    expect(merged.values.firstName).toBe('Kofi');
    expect(merged.values.alias).toBe('K');
  });

  it('fills an untouched field from the latest detail and leaves nothing undefined', () => {
    const merged = mergeKeptValues(latest, { firstName: 'Kofi' });

    expect(merged.values.lastName).toBe('Mensah');
    expect(merged.values.memberNo).toBe('M-1001');
    for (const value of Object.values(merged.values)) {
      expect(value).not.toBeUndefined();
    }
  });
});

describe('fromMemberDetail', () => {
  it('prefills every editable field from the detail DTO', () => {
    const form = fromMemberDetail(
      detail({
        otherNames: 'Kwame',
        maidenName: 'Owusu',
        alias: 'Ama',
        dob: '1990-02-03',
        addressLine: 'House 14',
      }),
    );

    expect(form.memberNo).toBe('M-1001');
    expect(form.firstName).toBe('Ama');
    expect(form.lastName).toBe('Mensah');
    expect(form.otherNames).toBe('Kwame');
    expect(form.maidenName).toBe('Owusu');
    expect(form.alias).toBe('Ama');
    expect(form.dob).toBe('1990-02-03');
    expect(form.gender).toBe('female');
    expect(form.placeOfResidence).toBe('Adenta');
    expect(form.addressLine).toBe('House 14');
    expect(form.joinedOn).toBe('2026-01-04');
    expect(form.isPresbyter).toBe(true);
  });
});

describe('memberNoConflictMessage', () => {
  it('maps a create 409 to a member-number field message', () => {
    const error = new ApiError(409, 'A member with number M-1001 already exists', {
      code: 'conflict',
    });
    expect(memberNoConflictMessage(error)).toBe('A member with number M-1001 already exists');
  });

  it('ignores non-conflict failures so they use the banner', () => {
    expect(memberNoConflictMessage(new ApiError(500, 'Server error'))).toBeNull();
    expect(memberNoConflictMessage(new Error('network'))).toBeNull();
  });
});

describe('isStaleConflictError', () => {
  it('recognises the lost-update conflict only', () => {
    expect(
      isStaleConflictError(new ApiError(409, 'The member was modified since the supplied ETag')),
    ).toBe(true);
    expect(
      isStaleConflictError(
        new ApiError(
          409,
          'Member M-1001 still shepherds 2 member(s); reassign them before clearing',
        ),
      ),
    ).toBe(false);
    expect(isStaleConflictError(new ApiError(500, 'Server error'))).toBe(false);
  });
});
