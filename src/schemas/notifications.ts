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
  /**
   * The publish precondition: a hash over slots, templates and flier, not the
   * revision. A draft edits in place, so the revision cannot tell two drafts
   * apart (N-3, FR-17).
   */
  contentEtag: z.string(),
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
  /**
   * FR-16/FR-44: aggregate counts by reason, and a named sample only of the
   * `no_contact` exclusions. Members who muted or blocked are counted, never
   * named.
   */
  excluded: z.object({
    counts: z.object({
      channel_blocked: z.number().int().nonnegative(),
      event_muted: z.number().int().nonnegative(),
      period_muted: z.number().int().nonnegative(),
      cadence_filtered: z.number().int().nonnegative(),
      no_contact: z.number().int().nonnegative(),
    }),
    sample: z.array(z.object({ memberNo: z.string(), displayName: z.string() })),
  }),
});

/** The deployed cadence, read-only (N-8, FR-41). `0` is continuous. */
export const notificationTriggerSchema = z.union([
  z.object({ kind: z.literal('continuous') }),
  z.object({ kind: z.literal('interval'), minutes: z.number().int().positive() }),
]);

export type NotificationTrigger = z.infer<typeof notificationTriggerSchema>;

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
  /** Deployment configuration, not an editable default. */
  trigger: notificationTriggerSchema,
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

// -- the send side (R3) -------------------------------------------------------

export const notificationPublishInputSchema = z.object({
  /** The UI's typed confirmation above the SMS threshold (N-3). */
  confirmed: z.boolean().optional(),
});

export const notificationInstanceSchema = z.object({
  id: z.string(),
  planId: z.string(),
  kind: z.enum(['announce', 'reminder', 'starts', 'last', 'change']),
  revision: z.number().int().positive(),
  occurrenceDate: z.string().nullable(),
  sendAt: z.string(),
  deliveryAt: z.string().nullable(),
  status: z.enum(['scheduled', 'fanning_out', 'sent', 'cancelled', 'failed']),
  recipientCount: z.number().int().nonnegative(),
  sentCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
});

export const notificationPublishResultSchema = z.object({
  planId: z.string(),
  revision: z.number().int().positive(),
  status: z.literal('published'),
  contentEtag: z.string(),
  /** How many instances this call created; a republish creates none. */
  created: z.number().int().nonnegative(),
  instances: z.array(notificationInstanceSchema),
});

export const notificationCancelResultSchema = z.object({
  planId: z.string(),
  revision: z.number().int().positive(),
  status: z.literal('cancelled'),
  cancelledAt: z.string(),
  cancelledInstances: z.number().int().nonnegative(),
});

export const notificationChangeInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  bodyText: z.string().min(1),
  whatsappTemplate: z.string().trim().min(1).max(120).optional(),
  whatsappParameters: z.array(z.string()).optional(),
  emailSubject: z.string().trim().min(1).max(200).optional(),
  emailBodyText: z.string().min(1).optional(),
});

export const notificationChangeResultSchema = z.object({
  noticeId: z.string(),
  instance: notificationInstanceSchema,
});

export const notificationDeliverySchema = z.object({
  id: z.string(),
  instanceId: z.string(),
  memberId: z.string(),
  memberNo: z.string(),
  channel: z.enum(['email', 'sms', 'whatsapp']),
  routedVia: z.enum(['own', 'guardian']),
  contactId: z.string().nullable(),
  destinationMasked: z.string().nullable(),
  status: z.enum(['pending', 'sending', 'sent', 'failed', 'skipped']),
  skipReason: z
    .enum(['channel_blocked', 'event_muted', 'period_muted', 'cadence_filtered', 'no_contact'])
    .nullable(),
  attempts: z.number().int().nonnegative(),
  lastErrorCode: z
    .enum(['channel_unconfigured', 'transport_unavailable', 'provider_rejected'])
    .nullable(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
});

// -- the Notifications page's reads, replay and bulk retry (R3b) ---------------

/**
 * One range's four counts. They partition the deliveries — every row is exactly
 * one of them, `queued` being `pending` or `sending` — and a skipped delivery is
 * never counted as a failure, because a mute is the member's choice (FR-49).
 */
export const notificationCountsSchema = z.object({
  sent: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  /** `pending` plus `sending`. */
  queued: z.number().int().nonnegative(),
});

export const notificationChannelCountsSchema = notificationCountsSchema.extend({
  /** `ussd` is the inbox body and never a delivery. */
  channel: z.enum(['email', 'sms', 'whatsapp']),
});

/** `GET /v1/notification-summary`: computed live from the deliveries, no rollup (FR-49). */
export const notificationSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  overall: notificationCountsSchema,
  channels: z.array(notificationChannelCountsSchema),
});

/**
 * One delivery row with the member and the event named: the cross-event grid's
 * row, and the drawer's Deliveries tab, which groups rows per event by
 * `eventId`. The destination stays masked, so a failed row is traced to the
 * person and never to a contact value (AC-53, FR-35).
 */
export const notificationDeliveryRowSchema = notificationDeliverySchema.extend({
  /** The member's name, beside `memberNo`. */
  displayName: z.string(),
  /** The event the delivery belongs to, which the grid's Event column names. */
  eventName: z.string(),
  /**
   * The event's id, so the drawer's Deliveries tab groups rows per event by a
   * stable key rather than the display name (FR-51).
   */
  eventId: z.string(),
});

export const notificationDeliveryListSchema = z.object({
  items: z.array(notificationDeliveryRowSchema),
  nextCursor: z.string().optional(),
});

/**
 * One message in a member's inbox (FR-51, AC-55). `bodyText` is the rendered
 * body the member received: an event notification is a broadcast and not
 * private, so an officer may read it (owner, 2026-11-27). Reading this list
 * never sets `read_at` - only the member's own read does.
 */
export const notificationInboxMessageSchema = z.object({
  id: z.string(),
  /** `event` is a slot's broadcast; `system` is a notice with no event (N-14). */
  kind: z.enum(['event', 'system']),
  /** The derived title: the event name and slot kind, or the system notice's title. */
  title: z.string(),
  /** The rendered body, as the text the member received. */
  bodyText: z.string(),
  eventId: z.string().nullable(),
  eventName: z.string().nullable(),
  instanceId: z.string().nullable(),
  /** The slot the message came from; null for a system message. */
  slotKind: z.enum(['announce', 'reminder', 'starts', 'last', 'change']).nullable(),
  /** The instant its instance was due, which the drawer dates the message by; null for a system message. */
  sentAt: z.string().nullable(),
  createdAt: z.string(),
  /** Null while unread; set only by the member's own read, never by this read. */
  readAt: z.string().nullable(),
});

/** Pending first, then read; cursor-paged and `Cache-Control: no-store`. */
export const notificationInboxListSchema = z.object({
  items: z.array(notificationInboxMessageSchema),
  nextCursor: z.string().optional(),
});

/**
 * A live mute or channel block. This is FR-44's one named exception: the
 * Notifications page lists who declined, because lifting one early means finding
 * the person who asked (AC-54).
 */
export const notificationPreferenceRowSchema = z.object({
  /** The row a lift revokes; the row is never deleted. */
  id: z.string(),
  kind: z.enum(['event_mute', 'period_mute', 'channel_block']),
  memberNo: z.string(),
  displayName: z.string(),
  /**
   * The mute's stable scope id (`notification_mutes.scope_id`): the event or
   * period it covers. Null for a channel block, which covers a channel instead.
   */
  scopeId: z.string().nullable(),
  /** The scope's display name, never an id. Null for a channel block. */
  scope: z.string().nullable(),
  /** The blocked channel; null for a mute. */
  channel: z.enum(['email', 'sms', 'whatsapp']).nullable(),
  /** When the mute or block ends; every one expires (N-10). */
  expiresAt: z.string(),
  /** How it was set, which the officer needs before lifting it. */
  source: z.enum(['ussd', 'admin']),
});

export const notificationPreferenceListSchema = z.object({
  items: z.array(notificationPreferenceRowSchema),
});

/**
 * `GET /v1/members/{memberNo}/notification-settings`: the drawer's cadence
 * line and its live mutes and blocks, in the same row shape the page's live
 * list uses so a lift names the same id (FR-51, AC-54). A member with no
 * settings row reads `all`, the default.
 */
export const memberNotificationSettingsSchema = z.object({
  memberNo: z.string(),
  displayName: z.string(),
  /** `all`, `essential` or `minimal` (FR-10). */
  cadence: z.enum(['all', 'essential', 'minimal']),
  /** When the cadence was last written; null while it is the default. */
  updatedAt: z.string().nullable(),
  /** That member's live `event_mute` and `period_mute` rows only. */
  mutes: z.array(notificationPreferenceRowSchema),
  /** That member's live `channel_block` rows only. */
  blocks: z.array(notificationPreferenceRowSchema),
});

/**
 * FR-50's lift, shared by the mute and block revokes. Both fields are required
 * here - a lift without them is not a lift - and land in
 * `notification_preference_events` with the actor and the time.
 */
export const notificationPreferenceRevokeInputSchema = z.object({
  /** How the member gave it: in person, by phone, or by USSD code. */
  authorisedVia: z.enum(['in_person', 'phone', 'ussd_code']),
  /** What the member said or gave, in their own words. */
  reference: z.string().trim().min(1),
});

/** The revoked row: revoked, never deleted, so `revokedAt` proves the lift. */
export const notificationPreferenceRevokeResultSchema = notificationPreferenceRowSchema.extend({
  revokedAt: z.string(),
  revokedBy: z.string(),
});

/**
 * `POST /v1/notification-digest`: the daily failure digest, sent once on demand
 * and audited with the actor (FR-33, AC-51). The recipient is masked (FR-35).
 */
export const notificationDigestResultSchema = z.object({
  recipient: z.string(),
  /** How many failed deliveries the digest listed. */
  failureCount: z.number().int().nonnegative(),
  sentAt: z.string(),
});

/** The new row a replay writes; the original is untouched (FR-52). */
export const notificationReplayResultSchema = notificationDeliverySchema.extend({
  /** The original delivery this row replayed. */
  replayOf: z.string(),
});

/** One call retries at most this many ids (FR-53). */
export const NOTIFICATION_MAX_BULK_RETRY = 100;

/**
 * The explicit ids the officer saw — never a filter. An id that is no longer
 * `failed`, or whose failure is terminal, comes back refused rather than being
 * silently retried (FR-53).
 *
 * `.max` is a contract statement, not the whole rule: a body carrying more than
 * 100 ids must be refused `422 batch_too_large`, not the generic
 * `validation_error`, so the handler owes that mapping (FR-53, AC-57).
 */
export const notificationBulkRetryInputSchema = z.object({
  ids: z.array(z.string()).min(1).max(NOTIFICATION_MAX_BULK_RETRY),
});

export const notificationBulkRetryRowSchema = z.object({
  id: z.string(),
  outcome: z.enum(['retried', 'refused']),
  /** Why the row was refused; null when it was retried. */
  reason: z.enum(['delivery_not_failed', 'delivery_not_retryable', 'not_found']).nullable(),
});

export const notificationBulkRetryResultSchema = z.object({
  retried: z.number().int().nonnegative(),
  refused: z.number().int().nonnegative(),
  results: z.array(notificationBulkRetryRowSchema),
});

export type NotificationPublishInput = z.infer<typeof notificationPublishInputSchema>;
export type NotificationPublishResult = z.infer<typeof notificationPublishResultSchema>;
export type NotificationCancelResult = z.infer<typeof notificationCancelResultSchema>;
export type NotificationChangeInput = z.infer<typeof notificationChangeInputSchema>;
export type NotificationChangeResult = z.infer<typeof notificationChangeResultSchema>;
export type NotificationInstance = z.infer<typeof notificationInstanceSchema>;
export type NotificationDelivery = z.infer<typeof notificationDeliverySchema>;
export type NotificationCounts = z.infer<typeof notificationCountsSchema>;
export type NotificationSummary = z.infer<typeof notificationSummarySchema>;
export type NotificationDeliveryRow = z.infer<typeof notificationDeliveryRowSchema>;
export type NotificationInboxMessage = z.infer<typeof notificationInboxMessageSchema>;
export type NotificationInboxList = z.infer<typeof notificationInboxListSchema>;
export type NotificationPreferenceRow = z.infer<typeof notificationPreferenceRowSchema>;
export type MemberNotificationSettings = z.infer<typeof memberNotificationSettingsSchema>;
export type NotificationPreferenceRevokeInput = z.infer<
  typeof notificationPreferenceRevokeInputSchema
>;
export type NotificationPreferenceRevokeResult = z.infer<
  typeof notificationPreferenceRevokeResultSchema
>;
export type NotificationDigestResult = z.infer<typeof notificationDigestResultSchema>;
export type NotificationReplayResult = z.infer<typeof notificationReplayResultSchema>;
export type NotificationBulkRetryInput = z.infer<typeof notificationBulkRetryInputSchema>;
export type NotificationBulkRetryResult = z.infer<typeof notificationBulkRetryResultSchema>;
