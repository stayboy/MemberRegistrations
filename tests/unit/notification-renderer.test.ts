import { describe, expect, it } from 'vitest';
import {
  EMAIL_TEXT_VARIABLES,
  NOTIFICATION_BODY_VARIABLES,
  assertKnownVariables,
  escapeHtml,
  resolvedValues,
  substituteHtml,
  substitutePlain,
  variablesIn,
  type NotificationValues,
} from '../../src/domain/notifications/variables.js';
import {
  paginateUssd,
  renderEmail,
  renderSms,
  renderUssd,
  renderWhatsApp,
  smsSegments,
  validateEmailDocument,
} from '../../src/domain/notifications/render.js';
import {
  assertIfMatch,
  assertNoDuplicateInstants,
  assertSlots,
  planEtag,
  revisionToWrite,
  resolveSlot,
  zonedWallClockToUtc,
} from '../../src/domain/notifications/plan.js';
import { PreconditionFailedError, ValidationError } from '../../src/errors/domain-errors.js';

const values: NotificationValues = {
  firstName: 'Ada',
  fullName: 'Ada Mensah',
  eventName: 'The Convention',
  eventDate: '2026-12-06',
  startTime: '09:00',
  endTime: '12:00',
  venue: 'The Auditorium',
  periodName: 'Communion Week',
  memberNo: 'M-1042',
  churchName: 'Grace Assembly',
  flierUrl: '/fliers/abc',
};

const facts = {
  startDate: '2026-12-06',
  endDate: '2026-12-08',
  startTime: '09:00',
  endTime: '12:00',
  timezone: 'Africa/Lagos',
  occurrences: [
    { date: '2026-12-06', startTime: '09:00', endTime: '12:00', status: 'scheduled' },
    { date: '2026-12-08', startTime: '09:00', endTime: '12:00', status: 'scheduled' },
  ],
};

describe('the closed variable set', () => {
  it('names every variable once and refuses an unknown one', () => {
    expect(NOTIFICATION_BODY_VARIABLES).toContain('firstName');
    expect(NOTIFICATION_BODY_VARIABLES).not.toContain('flierUrl');
    expect(variablesIn('{{firstName}} {{fullName}} {{firstName}}')).toEqual([
      'firstName',
      'fullName',
    ]);
    expect(() => assertKnownVariables('Hi {{surname}}')).toThrow(/unknown variable/);
    try {
      assertKnownVariables('Hi {{surname}}');
    } catch (error) {
      expect((error as ValidationError).code).toBe('unknown_variable');
    }
  });

  it('reserves {{flierUrl}} for the email plain-text alternative', () => {
    expect(() => substitutePlain('poster {{flierUrl}}', values)).toThrow(/unknown variable/);
    expect(substitutePlain('poster {{flierUrl}}', values, EMAIL_TEXT_VARIABLES)).toBe(
      'poster /fliers/abc',
    );
  });

  it('renders a null empty, and falls back first name -> full name -> friend', () => {
    expect(substitutePlain('[{{venue}}]', { ...values, venue: null })).toBe('[]');
    expect(resolvedValues({ ...values, firstName: null }).firstName).toBe('Ada Mensah');
    expect(resolvedValues({ ...values, firstName: '  ', fullName: null }).firstName).toBe('friend');
    expect(resolvedValues({ ...values, firstName: null, fullName: null }).firstName).toBe('friend');
  });

  it('escapes a value for HTML and leaves it literal in plain text', () => {
    const hostile = { ...values, eventName: '<script>alert(1)</script> & "quoted"' };
    expect(escapeHtml('<b>')).toBe('&lt;b&gt;');
    expect(substituteHtml('{{eventName}}', hostile)).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot;',
    );
    expect(substitutePlain('{{eventName}}', hostile)).toBe('<script>alert(1)</script> & "quoted"');
  });
});

describe('the email document', () => {
  it('accepts the closed node set and renders it with escaped text', () => {
    const document = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Hello {{firstName}}' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', marks: [{ type: 'bold' }], text: 'Bold' },
            { type: 'hardBreak' },
            { type: 'text', text: '<script>' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              marks: [{ type: 'link', attrs: { href: 'https://example.org' } }],
              text: 'Link',
            },
          ],
        },
      ],
    };

    const rendered = renderEmail(
      { subject: '{{eventName}}', body: document, bodyText: '{{firstName}} {{flierUrl}}' },
      values,
      null,
      'events@example.org',
    );
    expect(rendered.subject).toBe('The Convention');
    expect(rendered.html).toContain('<h2 style="margin:18px 0 8px;font-size:20px">Hello Ada</h2>');
    expect(rendered.html).toContain('<strong>Bold</strong>');
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).toContain('<ul style="margin:0 0 12px;padding-left:20px"><li>');
    expect(rendered.html).toContain('<a href="https://example.org">Link</a>');
    expect(rendered.html).toContain('Grace Assembly');
    expect(rendered.html).toContain('Manage alerts in USSD');
    expect(rendered.html).toContain('mailto:events@example.org');
    expect(rendered.text).toBe('Ada /fliers/abc');
  });

  it('attaches the flier inline and never puts its URL in the HTML', () => {
    const rendered = renderEmail(
      {
        subject: 'Poster',
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
        },
        bodyText: 'Hi',
      },
      values,
      { url: '/fliers/abc', contentType: 'image/webp', token: 'abc' },
      null,
    );
    expect(rendered.attachments).toEqual([
      { filename: 'flier.webp', contentType: 'image/webp', url: '/fliers/abc', inline: true },
    ]);
    expect(rendered.html).not.toContain('/fliers/abc');
  });

  it('refuses a node, a heading level and a link the editor does not offer', () => {
    expect(() => validateEmailDocument({ type: 'doc', content: [{ type: 'script' }] })).toThrow(
      /no `script` node/,
    );
    expect(() =>
      validateEmailDocument({
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 4 }, content: [] }],
      }),
    ).toThrow(/level 2 or 3/);
    expect(() =>
      validateEmailDocument({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                text: 'x',
              },
            ],
          },
        ],
      }),
    ).toThrow(/http\(s\), mailto or same-origin/);
  });

  it('refuses a string body as client HTML', () => {
    expect(() => validateEmailDocument('<p>hello</p>')).toThrow(/structured document/);
  });
});

describe('WhatsApp', () => {
  it('orders the parameters by slot and keeps the URL out of the body', () => {
    const rendered = renderWhatsApp(
      { templateName: 'event_announce', parameterMap: { eventName: 2, firstName: 1 } },
      values,
      { url: '/fliers/abc', contentType: 'image/png', token: 'abc' },
    );
    expect(rendered.parameters).toEqual([
      { name: 'firstName', slot: 1, value: 'Ada' },
      { name: 'eventName', slot: 2, value: 'The Convention' },
    ]);
    expect(rendered.body).toBe('Ada · The Convention');
    expect(rendered.headerMediaUrl).toBe('/fliers/abc');
    expect(rendered.body).not.toContain('/fliers/');
  });

  it('refuses a gapped slot map and an unknown variable name', () => {
    expect(() =>
      renderWhatsApp(
        { templateName: 't', parameterMap: { firstName: 1, eventName: 3 } },
        values,
        null,
      ),
    ).toThrow(/1\.\.n/);
    expect(() =>
      renderWhatsApp({ templateName: 't', parameterMap: { surname: 1 } }, values, null),
    ).toThrow(/unknown variable/);
  });
});

describe('SMS encoding and segments', () => {
  it('counts GSM-7 at 160 for one segment and 153 for a multipart one', () => {
    expect(smsSegments('a'.repeat(160))).toMatchObject({ encoding: 'gsm7', segments: 1 });
    expect(smsSegments('a'.repeat(161))).toMatchObject({ encoding: 'gsm7', segments: 2 });
    expect(smsSegments('a'.repeat(306))).toMatchObject({ segments: 2 });
    expect(smsSegments('a'.repeat(307))).toMatchObject({ segments: 3 });
  });

  it('counts a GSM extension character as two', () => {
    expect(smsSegments('€'.repeat(80))).toMatchObject({ encoding: 'gsm7', length: 160 });
  });

  it('switches to UCS-2 at 70/67 for one emoji', () => {
    expect(smsSegments('🎉')).toMatchObject({ encoding: 'ucs2', length: 2, segments: 1 });
    expect(smsSegments('a'.repeat(69) + '🎉')).toMatchObject({ encoding: 'ucs2', segments: 2 });
  });

  it('substitutes the variables before it counts', () => {
    const rendered = renderSms('{{firstName}}, {{eventName}}', values);
    expect(rendered.body).toBe('Ada, The Convention');
    expect(rendered.segments).toBe(1);
  });
});

describe('USSD pagination', () => {
  it('keeps every screen inside the budget and marks the continuation', () => {
    const body = Array.from({ length: 60 }, () => 'word').join(' ');
    const screens = paginateUssd(body, 120);
    expect(screens.length).toBeGreaterThan(1);
    for (const screen of screens) expect(screen.length).toBeLessThanOrEqual(120);
    for (const screen of screens.slice(0, -1)) expect(screen).toMatch(/\n0 More$/);
    expect(screens.at(-1)).not.toContain('0 More');
    const reconstructed = screens
      .map((screen) => screen.replace(/\n0 More$/, ''))
      .join(' ')
      .replaceAll(/\s+/g, ' ')
      .trim();
    expect(reconstructed).toBe(body);
  });

  it('hard-splits a token longer than a screen rather than dropping it', () => {
    const screens = paginateUssd('x'.repeat(400), 120);
    expect(screens.every((screen) => screen.length <= 120)).toBe(true);
    expect(screens.join('').replaceAll('0 More', '').replaceAll(/\s/g, '')).toBe('x'.repeat(400));
  });

  it('returns one screen for a short body and refuses an impossible budget', () => {
    expect(paginateUssd('short', 120)).toEqual(['short']);
    expect(() => paginateUssd('x', 8)).toThrow(/at least 9/);
  });

  it('renders a body through the renderer', () => {
    expect(renderUssd('{{eventName}}', values, 120)).toEqual({
      body: 'The Convention',
      screens: ['The Convention'],
      budget: 120,
    });
  });
});

describe('slot resolution and the revision rule', () => {
  it('reads a wall clock in the event timezone as a UTC instant', () => {
    // Africa/Lagos is UTC+1 all year.
    expect(zonedWallClockToUtc('2026-12-06', '09:00', 'Africa/Lagos').toISOString()).toBe(
      '2026-12-06T08:00:00.000Z',
    );
  });

  it('repeats an occurrence-anchored slot per occurrence and skips a cancelled one', () => {
    const withCancelled = {
      ...facts,
      occurrences: [
        ...facts.occurrences,
        { date: '2026-12-07', startTime: '09:00', endTime: '12:00', status: 'cancelled' },
      ],
    };
    const resolved = resolveSlot(
      { kind: 'starts', anchor: 'occurrence_start', offsetMinutes: 0, sortOrder: 0 },
      withCancelled,
      new Date('2026-11-25T00:00:00Z'),
    );
    expect(resolved.map((entry) => entry.occurrenceDate)).toEqual(['2026-12-06', '2026-12-08']);
    expect(resolved[0]!.instant.toISOString()).toBe('2026-12-06T08:00:00.000Z');
  });

  it('finds a duplicate instant per occurrence', () => {
    const base = {
      kind: 'starts' as const,
      anchor: 'occurrence_start' as const,
      offsetMinutes: 0,
    };
    const resolved = [
      ...resolveSlot({ ...base, sortOrder: 0 }, facts, new Date()),
      ...resolveSlot({ ...base, sortOrder: 1 }, facts, new Date()),
    ];
    expect(() => assertNoDuplicateInstants(resolved)).toThrow(/duplicate|both resolve/);
  });

  it('edits a draft in place and freezes a published revision', () => {
    expect(revisionToWrite([])).toEqual({ revision: 1, createsRevision: true });
    expect(revisionToWrite([{ revision: 1, status: 'draft' }])).toEqual({
      revision: 1,
      createsRevision: false,
    });
    expect(revisionToWrite([{ revision: 1, status: 'published' }])).toEqual({
      revision: 2,
      createsRevision: true,
    });
    expect(
      revisionToWrite([
        { revision: 1, status: 'published' },
        { revision: 2, status: 'draft' },
      ]),
    ).toEqual({ revision: 2, createsRevision: false });
  });

  it('refuses an If-Match that names a different revision with HTTP 412', () => {
    expect(planEtag(3)).toBe('"r3"');
    expect(() => assertIfMatch('"r3"', 3)).not.toThrow();
    expect(() => assertIfMatch('r3', 3)).not.toThrow();
    expect(() => assertIfMatch(undefined, 3)).not.toThrow();
    expect(() => assertIfMatch('*', 3)).not.toThrow();
    try {
      assertIfMatch('"r2"', 3);
      throw new Error('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(PreconditionFailedError);
      expect((error as PreconditionFailedError).code).toBe('plan_revision_stale');
    }
  });

  it('refuses a slot set with no slots', () => {
    expect(() => assertSlots([], facts, new Date())).toThrow(/between 1 and 12/);
  });
});
