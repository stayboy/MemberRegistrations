import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import type { MemberDetail, MemberDetailResult } from '../api/members';
import {
  MEMBER_FORM_STEP_IDS,
  contactConflictErrors,
  createEmptyMemberForm,
  fromMemberDetail,
  isStaleConflictError,
  memberNoConflictMessage,
  mergeKeptValues,
  subscriptionPayerError,
  titleForbiddenByGender,
  titleOptionsForGender,
  toCreatePayload,
  toShepherdInput,
  toSubscriptionInput,
  toUpdatePayload,
  utcToday,
  validateMemberForm,
  validateMemberStep,
  validateReachability,
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
    title: null,
    membershipCardNo: null,
    verifiedAt: null,
    assemblyJoinedOn: null,
    cameFrom: null,
    movedOutOn: null,
    movedToAssembly: null,
    shepherd: null,
    guardian: null,
    calls: { attempts: 0, conversations: 0, lastCalledOn: null, lastReachedOn: null },
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
      addressLine: 'x'.repeat(301),
    });

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
      alias: 'K',
      dob: '',
      placeOfResidence: ' Adenta ',
    });

    expect(payload.memberNo).toBe('M-1009');
    expect(payload.firstName).toBe('Kofi');
    expect(payload.lastName).toBe('Mensah');
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

describe('membership fields (FR-29)', () => {
  it('leaves assemblyJoinedOn blank on a new form and sends null for every blank field', () => {
    const form = createEmptyMemberForm('2026-11-04');
    expect(form.assemblyJoinedOn).toBe('');

    const payload = toCreatePayload({
      ...form,
      memberNo: 'M-1009',
      firstName: 'Kofi',
      lastName: 'Mensah',
    });

    expect(payload).toMatchObject({
      assemblyJoinedOn: null,
      cameFrom: null,
      movedOutOn: null,
      movedToAssembly: null,
    });
  });

  it('round-trips the four fields through the edit form and the update body', () => {
    const member = detail({
      assemblyJoinedOn: '2018-02-04',
      cameFrom: 'Kumasi Central',
      movedOutOn: '2021-06-30',
      movedToAssembly: 'Accra North',
    });
    const form = fromMemberDetail(member);

    expect(form).toMatchObject({
      assemblyJoinedOn: '2018-02-04',
      cameFrom: 'Kumasi Central',
      movedOutOn: '2021-06-30',
      movedToAssembly: 'Accra North',
    });
    expect(toUpdatePayload({ ...form }, form)).toEqual({});
    expect(toUpdatePayload({ ...form, cameFrom: 'Tema New Town' }, form)).toEqual({
      cameFrom: 'Tema New Town',
    });
  });

  it('rejects an unreal assembly join or move-out date', () => {
    const errors = validateMemberForm({
      ...createEmptyMemberForm('2026-11-04'),
      memberNo: 'M-1009',
      firstName: 'Kofi',
      lastName: 'Mensah',
      assemblyJoinedOn: '2020-02-30',
      movedOutOn: '30/06/2021',
    });

    expect(errors.assemblyJoinedOn).toBeDefined();
    expect(errors.movedOutOn).toBeDefined();
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

/** A form with a valid member number, for the reachability and title cases. */
function form(overrides: Record<string, unknown> = {}) {
  return { ...createEmptyMemberForm('2026-11-04'), memberNo: 'M-1009', ...overrides };
}

describe('reachability and the guardian on the form (MR-38, MR-48)', () => {
  it('accepts an own contact or a guardian, and names the guardian field when neither is set', () => {
    expect(validateReachability(form())).toEqual({
      guardianMemberNo: 'Record a phone, email or WhatsApp number, or choose a guardian.',
    });
    expect(validateReachability(form({ phone: '+233 24 555 0109' }))).toEqual({});
    expect(validateReachability(form({ guardianMemberNo: 'A-1001' }))).toEqual({});
  });

  it('sends the guardian with the create body and never with the update body', () => {
    const values = form({ guardianMemberNo: 'A-1001' });
    expect(toCreatePayload(values)).toMatchObject({ guardianMemberNo: 'A-1001' });

    const original = fromMemberDetail(detail({ guardian: null }));
    expect(toUpdatePayload({ ...original, guardianMemberNo: 'A-1001' }, original)).toEqual({});
  });

  it('builds the post-create shepherd assignment, or none', () => {
    expect(toShepherdInput(form())).toBeNull();
    expect(toShepherdInput(form({ shepherdMemberNo: 'O-2001' }))).toEqual({
      officerMemberNo: 'O-2001',
      assignedOn: '2026-11-04',
    });
    expect(
      toShepherdInput(form({ shepherdMemberNo: 'O-2001', shepherdAssignedOn: '2026-01-02' })),
    ).toEqual({ officerMemberNo: 'O-2001', assignedOn: '2026-01-02' });
  });
});

describe('titles on the form (MR-11..MR-13)', () => {
  const titles = [
    { code: 'elder', label: 'Elder', genderRestriction: 'male' as const, active: true },
    { code: 'deaconess', label: 'Deaconess', genderRestriction: 'female' as const, active: true },
    { code: 'pastor', label: 'Pastor', genderRestriction: null, active: true },
    { code: 'retired', label: 'Retired', genderRestriction: null, active: false },
  ];

  it('offers the active titles the gender allows', () => {
    expect(titleOptionsForGender(titles, 'female').map((title) => title.code)).toEqual([
      'deaconess',
      'pastor',
    ]);
    expect(titleOptionsForGender(titles, 'male').map((title) => title.code)).toEqual([
      'elder',
      'pastor',
    ]);
    expect(titleOptionsForGender(titles, 'undisclosed').map((title) => title.code)).toEqual([
      'pastor',
    ]);
  });

  it('clears a held title the edited gender forbids', () => {
    expect(titleForbiddenByGender(titles, 'elder', 'female')?.label).toBe('Elder');
    expect(titleForbiddenByGender(titles, 'elder', 'male')).toBeNull();
    expect(titleForbiddenByGender(titles, 'pastor', 'female')).toBeNull();
    expect(titleForbiddenByGender(titles, '', 'female')).toBeNull();
  });

  it('sends the title and date on create, and only the changed one on edit', () => {
    const created = toCreatePayload(form({ titleCode: 'pastor', titledOn: '2020-02-03' }));
    expect(created).toMatchObject({ titleCode: 'pastor', titledOn: '2020-02-03' });

    const original = fromMemberDetail(
      detail({ title: { code: 'pastor', label: 'Pastor', titledOn: '2020-02-03' } }),
    );
    expect(toUpdatePayload({ ...original }, original)).toEqual({});
    expect(toUpdatePayload({ ...original, titledOn: '2021-01-01' }, original)).toEqual({
      titledOn: '2021-01-01',
    });
    // A cleared title rides alone: the API clears the date with it.
    expect(toUpdatePayload({ ...original, titleCode: '', titledOn: '' }, original)).toEqual({
      titleCode: null,
    });
  });

  it('sends a changed title and a changed date together', () => {
    const original = fromMemberDetail(
      detail({ title: { code: 'elder', label: 'Elder', titledOn: '2020-02-03' } }),
    );

    expect(
      toUpdatePayload({ ...original, titleCode: 'pastor', titledOn: '2021-01-01' }, original),
    ).toEqual({ titleCode: 'pastor', titledOn: '2021-01-01' });
    // A changed title alone still sends only the title.
    expect(toUpdatePayload({ ...original, titleCode: 'pastor' }, original)).toEqual({
      titleCode: 'pastor',
    });
  });

  it('rejects a future office date and a date without a title', () => {
    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);
    const futureError = validateMemberForm(
      form({ titleCode: 'pastor', titledOn: future.toISOString().slice(0, 10) }),
    );
    expect(futureError.titledOn).toBe('Titled on cannot be in the future.');

    expect(validateMemberForm(form({ titledOn: '2020-02-03' })).titledOn).toBe(
      'Choose a presbyter title before the date it began.',
    );
    expect(
      validateMemberForm(form({ titleCode: 'pastor', titledOn: '2020-02-03' })).titledOn,
    ).toBeUndefined();
  });

  it('carries the membership card and turns a blank one into null', () => {
    expect(toCreatePayload(form({ membershipCardNo: ' MC-1001 ' })).membershipCardNo).toBe(
      'MC-1001',
    );
    expect(toCreatePayload(form()).membershipCardNo).toBeNull();
    expect(validateMemberForm(form({ membershipCardNo: 'X'.repeat(33) })).membershipCardNo).toBe(
      'Membership card number must be 32 characters or fewer.',
    );
  });
});

describe('step validation (MR-48)', () => {
  it('knows the four steps and validates only the fields a step owns', () => {
    expect(MEMBER_FORM_STEP_IDS).toEqual(['person', 'church', 'relationships', 'review']);

    const personOnly = validateMemberStep('person', createEmptyMemberForm('2026-11-04'));
    expect(personOnly.memberNo).toBe('Member number is required.');
    expect(personOnly.firstName).toBe('First name is required.');
    expect(personOnly.titledOn).toBeUndefined();

    const churchOnly = validateMemberStep('church', createEmptyMemberForm('2026-11-04'));
    expect(churchOnly.memberNo).toBeUndefined();
    expect(churchOnly.titledOn).toBeUndefined();
  });

  it('validates everything on Review', () => {
    const errors = validateMemberStep('review', {
      ...createEmptyMemberForm('2026-11-04'),
      titledOn: '2020-02-03',
    });
    expect(errors.memberNo).toBe('Member number is required.');
    expect(errors.titledOn).toBe('Choose a presbyter title before the date it began.');
  });
});

describe('the second name field (MR-49)', () => {
  it('writes lastName and never sends otherNames', () => {
    const payload = toCreatePayload({
      ...createEmptyMemberForm('2026-11-04'),
      memberNo: 'M-1009',
      firstName: 'Kofi',
      lastName: 'Mensah',
    });

    expect(payload).toMatchObject({ firstName: 'Kofi', lastName: 'Mensah' });
    expect(payload).not.toHaveProperty('otherNames');
  });

  it('leaves an existing otherNames untouched on edit', () => {
    const original = fromMemberDetail(detail({ otherNames: 'Kwame' }));

    expect(toUpdatePayload({ ...original, lastName: 'Owusu' }, original)).toEqual({
      lastName: 'Owusu',
    });
    expect(toUpdatePayload({ ...original, alias: 'K' }, original)).toEqual({ alias: 'K' });
  });

  it('names the second required field Other names in its message', () => {
    const errors = validateMemberForm({
      ...createEmptyMemberForm('2026-11-04'),
      memberNo: 'M-1009',
      firstName: 'Kofi',
    });

    expect(errors.lastName).toBe('Other names is required.');
  });
});
