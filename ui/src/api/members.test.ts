import { describe, expect, it } from 'vitest';
import { memberDetailPath, membersListPath } from './members';

describe('membersListPath', () => {
  it('requests the subscriptions aggregate by default', () => {
    expect(membersListPath()).toBe('/gateway/v1/members?include=subscriptions');
  });

  it('adds status, query, limit and cursor', () => {
    const path = membersListPath({
      status: 'archived',
      q: '  ama  ',
      limit: 25,
      cursor: 'M-1002',
    });

    expect(path).toContain('status=archived');
    expect(path).toContain('q=ama');
    expect(path).toContain('limit=25');
    expect(path).toContain('cursor=M-1002');
  });

  it('only adds attendance when a series is selected', () => {
    expect(membersListPath({ includeAttendance: true })).not.toContain('attendance');

    const path = membersListPath({ includeAttendance: true, seriesId: 'series-1' });
    expect(path).toContain('include=attendance%2Csubscriptions');
    expect(path).toContain('seriesId=series-1');
  });

  it('omits the include parameter when subscriptions are switched off', () => {
    expect(membersListPath({ includeSubscriptions: false })).toBe('/gateway/v1/members');
  });
});

describe('memberDetailPath', () => {
  it('encodes the member number and widens the archived set', () => {
    expect(memberDetailPath('M 1/2')).toBe(
      '/gateway/v1/members/M%201%2F2?includeArchived=true',
    );
  });
});
