import { z } from 'zod';

/**
 * The notification plan's wire contract (member-registrations-event-notifications.md
 * N-2, N-3, N-7, N-12, N-14).
 *
 * Zod is the contract and OpenAPI is generated from it (AGENTS §11). Two rules
 * live outside the schema because they need the event or the defaults: the
 * kind/anchor pairing (FR-3), and the duplicate-instant check, which resolves the
 * slots against the event's occurrences in its own timezone.
 */

export const NOTIFICATION_SLOT_KINDS = ['announce', 'reminder', 'starts', 'last'] as const;
export type NotificationSlotKind = (typeof NOTIFICATION_SLOT_KINDS)[number];

export const NOTIFICATION_SLOT_ANCHORS = [
  'publish',
  'event_start',
  'event_end',
  'occurrence_start',
  'occurrence_end',
] as const;
export type NotificationSlotAnchor = (typeof NOTIFICATION_SLOT_ANCHORS)[number];

export const NOTIFICATION_CHANNELS = ['email', 'whatsapp', 'sms', 'ussd'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** The delivery channels; `ussd` is the inbox body and never a delivery. */

export const NOTIFICATION_OFFSET_MINUTES = { min: -10080, max: 10080 } as const;
export const NOTIFICATION_MAX_SLOTS = 12;

const offsetMinutesSchema = z
  .number()
  .int()
  .min(NOTIFICATION_OFFSET_MINUTES.min)
  .max(NOTIFICATION_OFFSET_MINUTES.max);

export const notificationSlotInputSchema = z.object({
  kind: z.enum(NOTIFICATION_SLOT_KINDS),
  anchor: z.enum(NOTIFICATION_SLOT_ANCHORS),
  offsetMinutes: offsetMinutesSchema,
});

export const notificationSlotsInputSchema = z
  .array(notificationSlotInputSchema)
  .min(1)
  .max(NOTIFICATION_MAX_SLOTS);

export type NotificationSlotInput = z.infer<typeof notificationSlotInputSchema>;

/**
 * Email is the only rich surface and its document is structured JSON, never
 * HTML (FR-15). The closed node set is checked by `validateEmailDocument`, so
 * this schema only insists on a JSON object: a string body is the client trying
 * to send HTML and is refused before it reaches the renderer.
 */
const emailDocumentSchema = z.record(z.string(), z.unknown());

const emailTemplateInputSchema = z.object({
  channel: z.literal('email'),
  subject: z.string().trim().min(1).max(200),
  /** TipTap document. */
  body: emailDocumentSchema,
  /** The stored plain-text alternative. */
  bodyText: z.string().min(1),
});

const whatsappTemplateInputSchema = z.object({
  channel: z.literal('whatsapp'),
  /** The approved template's name. */
  templateName: z.string().trim().min(1).max(120),
  /** Closed variable name -> its ordered body slot (`{ firstName: 1 }`). */
  parameterMap: z.record(z.string(), z.number().int().min(1)),
});

const smsTemplateInputSchema = z.object({
  channel: z.literal('sms'),
  bodyText: z.string().min(1),
});

const ussdTemplateInputSchema = z.object({
  channel: z.literal('ussd'),
  bodyText: z.string().min(1),
});

export const notificationTemplateInputSchema = z.discriminatedUnion('channel', [
  emailTemplateInputSchema,
  whatsappTemplateInputSchema,
  smsTemplateInputSchema,
  ussdTemplateInputSchema,
]);

export const notificationTemplatesInputSchema = z.array(notificationTemplateInputSchema);

/**
 * One PUT carries the whole draft revision (round grill 5): the slot set, the
 * templates and nothing else. The flier has its own verb, and a revision is not
 * a status write.
 */
export const notificationPlanWriteSchema = z.object({
  slots: notificationSlotsInputSchema.optional(),
  templates: notificationTemplatesInputSchema,
});

export type NotificationTemplateInput = z.infer<typeof notificationTemplateInputSchema>;
export type NotificationPlanWrite = z.infer<typeof notificationPlanWriteSchema>;

export const notificationSlotSchema = notificationSlotInputSchema.extend({
  id: z.string(),
  sortOrder: z.number().int().min(0),
});

export const notificationTemplateSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
  subject: z.string().nullable(),
  body: z.record(z.string(), z.unknown()).nullable(),
  bodyText: z.string().nullable(),
  templateName: z.string().nullable(),
  parameterMap: z.record(z.string(), z.number()).nullable(),
});

export const notificationFlierSchema = z.object({
  token: z.string(),
  contentType: z.enum(['image/webp', 'image/jpeg', 'image/png']),
  byteSize: z.number().int().positive(),
  sha256: z.string(),
  /** The public, immutable URL the email attaches and WhatsApp shows as a header. */
  url: z.string(),
  uploadedAt: z.string(),
});

export const notificationRevisionSchema = z.object({
  revision: z.number().int().positive(),
  status: z.enum(['draft', 'published', 'superseded', 'cancelled']),
  publishedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
});

/**
 * The plan read. `publish` states plainly that the verb is absent in this round
 * rather than leaving a gap a client could mistake for a permission problem
 * (round grill 1: R2 is the plan an officer can author and preview, not publish).
 */
export const notificationPlanSchema = z.object({
  planId: z.string().nullable(),
  eventId: z.string(),
  revision: z.number().int().positive(),
  status: z.enum(['draft', 'published', 'superseded', 'cancelled']),
  etag: z.string(),
  slots: z.array(notificationSlotSchema),
  templates: z.array(notificationTemplateSchema),
  flier: notificationFlierSchema.nullable(),
  revisions: z.array(notificationRevisionSchema),
  publish: z.object({
    enabled: z.boolean(),
    reason: z.string(),
  }),
});

const emailRenderSchema = z.object({
  subject: z.string(),
  html: z.string(),
  text: z.string(),
  /** The flier is attached inline and as a download, never a body URL (FR-13). */
  attachments: z.array(
    z.object({
      filename: z.string(),
      contentType: z.string(),
      url: z.string(),
      inline: z.boolean(),
    }),
  ),
});

const whatsappRenderSchema = z.object({
  templateName: z.string(),
  /**
   * The ordered parameter values the provider interpolates into `{{1}}…{{n}}`.
   * The approved template supplies the words; nothing here is prose.
   */
  parameters: z.array(
    z.object({ name: z.string(), slot: z.number().int().positive(), value: z.string() }),
  ),
  body: z.string(),
  /** The flier as the template header; no channel body carries a URL (N-7). */
  headerMediaUrl: z.string().nullable(),
});

const smsRenderSchema = z.object({
  body: z.string(),
  encoding: z.enum(['gsm7', 'ucs2']),
  length: z.number().int().nonnegative(),
  segments: z.number().int().nonnegative(),
});

const ussdRenderSchema = z.object({
  body: z.string(),
  screens: z.array(z.string()),
  budget: z.number().int().positive(),
});

export const notificationPreviewSchema = z.object({
  /** The revision the preview renders; a draft renders itself. */
  revision: z.number().int().positive(),
  /** The UTC date the audience and the sample recipient were evaluated at. */
  at: z.string(),
  renders: z.object({
    email: emailRenderSchema,
    whatsapp: whatsappRenderSchema,
    sms: smsRenderSchema,
    ussd: ussdRenderSchema,
  }),
  /**
   * `audience` is the event's audience intersection; the four channel counts
   * apply N-5's destination resolution to it. The exclusion sample is R3's,
   * because it needs the preference tables (round grill 2).
   */
  counts: z.object({
    audience: z.number().int().nonnegative(),
    email: z.number().int().nonnegative(),
    whatsapp: z.number().int().nonnegative(),
    sms: z.number().int().nonnegative(),
    /** Members who can authenticate, so they get an inbox row (N-4). */
    ussd: z.number().int().nonnegative(),
  }),
  /** The member the rendered variables came from; null when nobody matched. */
  sample: z.object({ memberNo: z.string(), displayName: z.string() }).nullable(),
});

export const notificationDefaultsSchema = z.object({
  slots: notificationSlotsInputSchema,
  churchName: z.string(),
  emailSignature: z.string(),
  emailReplyTo: z.string().nullable(),
  smsConfirmThreshold: z.number().int().nonnegative(),
  whatsappTemplates: z.record(z.string(), z.string()),
  sendMode: z.enum(['always', 'window', 'daily']),
  sendFrom: z.string(),
  sendTo: z.string(),
  sendHour: z.string(),
  churchTimezone: z.string(),
  digestHour: z.string(),
  failureDigestTo: z.string().nullable(),
  failureDigestEnabled: z.boolean(),
  updatedAt: z.string().nullable(),
  updatedBy: z.string().nullable(),
});

const clockSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'must be a wall-clock time');

export const notificationDefaultsWriteSchema = z.object({
  slots: notificationSlotsInputSchema.optional(),
  churchName: z.string().trim().min(1).max(200).optional(),
  emailSignature: z.string().max(2000).optional(),
  emailReplyTo: z.string().email().nullable().optional(),
  smsConfirmThreshold: z.number().int().nonnegative().optional(),
  whatsappTemplates: z.record(z.string(), z.string().min(1).max(120)).optional(),
  sendMode: z.enum(['always', 'window', 'daily']).optional(),
  sendFrom: clockSchema.optional(),
  sendTo: clockSchema.optional(),
  sendHour: clockSchema.optional(),
  churchTimezone: z.string().min(1).max(64).optional(),
  digestHour: clockSchema.optional(),
  failureDigestTo: z.string().email().nullable().optional(),
  failureDigestEnabled: z.boolean().optional(),
});

export type NotificationDefaultsWrite = z.infer<typeof notificationDefaultsWriteSchema>;
