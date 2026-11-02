import { describe, expect, it } from 'vitest';
import { Member } from '../../src/domain/member.js';
import { ConflictError, NotFoundError, ValidationError } from '../../src/errors/domain-errors.js';

function buildMember(overrides: Partial<Parameters<typeof Member.create>[0]> = {}): Member {
  return Member.create({
    memberNo: 'M-1001',
    firstName: 'Ama',
    lastName: 'Mensah',
    ...overrides,
  });
}

describe('Member aggregate', () => {
  it('creates a member and makes the first contact preferred', () => {
    const member = buildMember({
      otherNames: 'Akosua',
      dateOfBirth: '1990-04-12',
      contacts: [
        { channel: 'email', value: 'ama@example.com' },
        { channel: 'phone', value: '+233200000000' },
      ],
      subscriptions: ['life-insurance'],
      ministries: ['choir', 'prayer'],
    });

    expect(member.memberNo).toBe('M-1001');
    expect(member.contacts).toHaveLength(2);
    expect(member.contacts[0]?.preferred).toBe(true);
    expect(member.contacts[1]?.preferred).toBe(false);
    expect(member.subscriptions).toEqual([
      expect.objectContaining({ kind: 'life-insurance', status: 'active' }),
    ]);
    expect(member.ministries).toEqual(['choir', 'prayer']);
  });

  it('trims text and drops blank optional values', () => {
    const member = buildMember({ firstName: '  Ama  ', alias: '   ' });

    expect(member.firstName).toBe('Ama');
    expect(member.alias).toBeUndefined();
  });

  it('rejects an invalid member number', () => {
    expect(() => buildMember({ memberNo: '../etc/passwd' })).toThrow(ValidationError);
  });

  it('rejects malformed dates', () => {
    expect(() => buildMember({ dateOfBirth: '12-04-1990' })).toThrow(ValidationError);
  });

  it('rejects duplicate contacts', () => {
    expect(() =>
      buildMember({
        contacts: [
          { channel: 'email', value: 'Ama@Example.com' },
          { channel: 'email', value: 'ama@example.com' },
        ],
      }),
    ).toThrow(ConflictError);
  });

  it('rejects a ministry assignment twice', () => {
    const member = buildMember({ ministries: ['choir'] });
    expect(() => member.assignMinistry('choir')).toThrow(ConflictError);
  });

  it('rejects an update with no fields', () => {
    expect(() => buildMember().update({})).toThrow(ValidationError);
  });

  it('removes a contact and promotes the next one to preferred', () => {
    const member = buildMember({
      contacts: [
        { channel: 'email', value: 'ama@example.com' },
        { channel: 'phone', value: '+233200000000' },
      ],
    });
    const [email, phone] = member.contacts;

    member.removeContact(email!.id);

    expect(member.contacts).toHaveLength(1);
    expect(member.contacts[0]?.id).toBe(phone!.id);
    expect(member.contacts[0]?.preferred).toBe(true);
  });

  it('throws when removing an unknown contact', () => {
    expect(() => buildMember().removeContact('missing')).toThrow(NotFoundError);
  });

  it('deactivates subscriptions instead of duplicating them', () => {
    const member = buildMember({ subscriptions: ['credit-union'] });

    member.unsubscribe('credit-union');
    expect(member.subscriptions[0]?.status).toBe('inactive');

    member.subscribe('credit-union');
    expect(member.subscriptions).toHaveLength(1);
    expect(member.subscriptions[0]?.status).toBe('active');
  });

  it('prevents duplicate attendance for the same event and date', () => {
    const member = buildMember();
    const entry = { eventNo: 'E-1', eventName: 'Harvest', date: '2026-10-04' };

    member.recordAttendance(entry);

    expect(() => member.recordAttendance(entry)).toThrow(ConflictError);
  });

  it('summarises attendance by event name', () => {
    const member = buildMember();
    member.recordAttendance({ eventNo: 'E-1', eventName: 'Harvest', date: '2026-10-04' });
    member.recordAttendance({ eventNo: 'E-2', eventName: 'Harvest', date: '2026-10-11' });
    member.recordAttendance({ eventNo: 'E-3', eventName: 'Convention', date: '2026-09-01' });

    expect(member.attendanceSummary()).toEqual([
      { eventName: 'Convention', attendances: 1, lastDate: '2026-09-01' },
      { eventName: 'Harvest', attendances: 2, lastDate: '2026-10-11' },
    ]);
  });

  it('round-trips through a snapshot without sharing mutable state', () => {
    const member = buildMember({ ministries: ['pemem'] });
    const snapshot = member.toJSON();
    const restored = Member.fromSnapshot(snapshot);

    snapshot.ministries.push('choir');

    expect(restored.ministries).toEqual(['pemem']);
    expect(restored.memberNo).toBe(member.memberNo);
  });
});
