import { describe, expect, it } from 'vitest';
import {
  createEventParentSchema,
  eventParentSchema,
  eventPreviewInputSchema,
  eventPreviewSchema,
  updateEventParentSchema,
} from '../../src/schemas/events.js';
import { audienceListQuerySchema } from '../../src/schemas/audiences.js';

const EVERYONE = '11111111-1111-4111-8111-111111111111';
const CHOIR = '22222222-2222-4222-8222-222222222222';

const standalone = {
  name: 'Harvest Thanksgiving',
  venueType: 'auditorium',
  startTime: '17:00',
  occurrences: [{ date: '2026-11-27' }],
};

const audienceSummary = {
  id: EVERYONE,
  name: 'Everyone',
  system: true,
  summary: 'Everyone - all of membership status active',
};

const parentRead = {
  id: '33333333-3333-4333-8333-333333333333',
  eventNo: 'EVT-2026-001',
  name: 'Harvest Thanksgiving',
  audienceIds: [EVERYONE],
  audiences: [audienceSummary],
  audienceId: EVERYONE,
  audience: audienceSummary,
  ministry: null,
  presbyterOnly: false,
  timezone: 'UTC',
  description: null,
  venueType: 'auditorium',
  venueName: null,
  startDate: '2026-11-27',
  endDate: '2026-11-27',
  startTime: '17:00',
  endTime: null,
  tracksMembers: true,
  status: 'draft',
  period: null,
  recurrence: null,
  occurrences: [],
  offerings: [],
  stats: {
    attachedEvents: 0,
    pledgedMinor: 0,
    paidMinor: 0,
    pendingMinor: 0,
    honorRate: 0,
    contributionCount: 0,
  },
  summary: {
    from: '2026-11-01',
    to: '2026-11-30',
    nextOccurrence: '2026-11-27',
    attendance: {
      memberSessions: { held: 0, expected: 0, present: 0, rate: null },
      lastHeld: null,
      headcountSessions: { held: 0 },
      cancelled: 0,
      upcoming: 1,
    },
    offerings: {
      attachedCount: 0,
      currency: 'GHS',
      paidMinor: 0,
      pledgedMinor: 0,
      outstandingMinor: 0,
      countedMinor: 0,
      visitors: { count: 0, paidMinor: 0 },
    },
  },
};

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return (result.error?.issues ?? []).map((issue) => issue.path.join('.'));
}

describe('event write contract', () => {
  it('refuses eventNo on create by name', () => {
    const result = createEventParentSchema.safeParse({ ...standalone, eventNo: 'CLIENT-1' });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('eventNo');
  });

  it('refuses eventNo on patch by name', () => {
    const result = updateEventParentSchema.safeParse({ eventNo: 'EVT-2026-002' });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('eventNo');
  });

  it('accepts audienceId alone as a one-element alias', () => {
    const result = createEventParentSchema.safeParse({ ...standalone, audienceId: CHOIR });

    expect(result.success).toBe(true);
    expect(result.data?.audienceId).toBe(CHOIR);
  });

  it('refuses a duplicate audienceIds entry', () => {
    const result = createEventParentSchema.safeParse({
      ...standalone,
      audienceIds: [CHOIR, CHOIR],
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('audienceIds.1');
  });

  it('refuses an empty audienceIds set', () => {
    const result = createEventParentSchema.safeParse({ ...standalone, audienceIds: [] });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('audienceIds');
  });

  it('refuses an audienceId that disagrees with the first audienceIds element, naming both', () => {
    const result = createEventParentSchema.safeParse({
      ...standalone,
      audienceIds: [CHOIR],
      audienceId: EVERYONE,
    });

    expect(result.success).toBe(false);
    const message = result.error?.issues.map((issue) => issue.message).join(' ') ?? '';
    expect(message).toContain('audienceId');
    expect(message).toContain('audienceIds');
  });

  it('accepts audienceIds whose first element matches the alias', () => {
    const result = createEventParentSchema.safeParse({
      ...standalone,
      audienceIds: [CHOIR],
      audienceId: CHOIR,
    });

    expect(result.success).toBe(true);
  });

  it('applies the same alias rule on patch', () => {
    const result = updateEventParentSchema.safeParse({
      audienceIds: [CHOIR],
      audienceId: EVERYONE,
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('audienceId');
  });
});

describe('event parent read contract', () => {
  it('carries the ordered audience set, its rendered summaries and the primary alias', () => {
    const result = eventParentSchema.safeParse(parentRead);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      eventNo: 'EVT-2026-001',
      audienceIds: [EVERYONE],
      audienceId: EVERYONE,
    });
    expect(result.data?.audiences[0]?.summary).toBe(audienceSummary.summary);
  });

  it('requires a non-null eventNo on read', () => {
    const result = eventParentSchema.safeParse({ ...parentRead, eventNo: null });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('eventNo');
  });

  it('requires audiences[] so a client never reads only the primary', () => {
    const { audiences: _audiences, ...withoutAudiences } = parentRead;
    const result = eventParentSchema.safeParse(withoutAudiences);

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('audiences');
  });
});

describe('event preview contract', () => {
  const recurrence = {
    schedules: [{ effectiveFrom: '2027-01-03', rrule: 'FREQ=WEEKLY;BYDAY=SU' }],
  };

  it('accepts a recurrence alone', () => {
    const result = eventPreviewInputSchema.safeParse({ recurrence, audienceIds: [CHOIR] });

    expect(result.success).toBe(true);
  });

  it('accepts a period with a cycle month', () => {
    const result = eventPreviewInputSchema.safeParse({
      period: { id: 'communion-week', cycleMonth: '2027-01' },
      audienceIds: [CHOIR],
    });

    expect(result.success).toBe(true);
  });

  it('refuses both a recurrence and a period', () => {
    const result = eventPreviewInputSchema.safeParse({
      recurrence,
      period: { id: 'gospel-week', cycleMonth: '2027-01' },
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('period');
  });

  it('refuses neither a recurrence nor a period', () => {
    const result = eventPreviewInputSchema.safeParse({ audienceIds: [CHOIR] });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('period');
  });

  it('refuses a cycle that is not a calendar month', () => {
    const result = eventPreviewInputSchema.safeParse({
      period: { id: 'home-cells', cycleMonth: '2027-13' },
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('period.cycleMonth');
  });

  it('accepts the documented preview response shape', () => {
    const result = eventPreviewSchema.safeParse({
      occurrences: [{ date: '2026-12-28', expected: 12 }],
      audienceCounts: [{ id: CHOIR, count: 42 }],
    });

    expect(result.success).toBe(true);
  });
});

describe('audience list contract', () => {
  it('accepts countAt as a UTC calendar date', () => {
    const result = audienceListQuerySchema.safeParse({ countAt: '2026-11-24' });

    expect(result.success).toBe(true);
    expect(result.data?.countAt).toBe('2026-11-24');
  });

  it('refuses a countAt that is not an ISO date', () => {
    const result = audienceListQuerySchema.safeParse({ countAt: '24/11/2026' });

    expect(result.success).toBe(false);
  });
});
