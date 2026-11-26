/**
 * The notification delivery port (member-registrations-event-notifications.md
 * N-8, FR-21).
 *
 * Three real adapters and a fake. They are deliberately new implementations
 * rather than `HttpMessageSender`: that adapter collapses 4xx and 5xx into one
 * 503, and FR-21 needs a 4xx naming the destination (`provider_rejected`,
 * terminal) to be different from a timeout or a 5xx (`transport_unavailable`,
 * retried with backoff).
 *
 * An unconfigured channel is `null`; its deliveries fail
 * `channel_unconfigured` on the first attempt. Only the worker constructs a
 * real sender — the API never holds one.
 */

export type NotificationChannel = 'email' | 'sms' | 'whatsapp';

export interface NotificationAttachment {
  filename: string;
  contentType: string;
  url: string;
  inline?: boolean;
}

export interface NotificationTemplate {
  name: string;
  /** The ordered values the approved template interpolates into `{{1}}…`. */
  parameters: string[];
}

export interface NotificationPayload {
  subject?: string;
  html?: string;
  text?: string;
  /** WhatsApp's template header image; email attaches instead (N-7, N-9). */
  mediaUrl?: string;
  template?: NotificationTemplate;
  attachments?: NotificationAttachment[];
}

export interface NotificationSender {
  send(to: string, payload: NotificationPayload): Promise<void>;
}

export type NotificationErrorCode = 'transport_unavailable' | 'provider_rejected';

/** A sanitised outcome: never the provider's body, never the destination. */
export class NotificationSendError extends Error {
  constructor(readonly code: NotificationErrorCode) {
    super(
      code === 'provider_rejected'
        ? 'The notification provider rejected the message'
        : 'The notification provider could not be reached',
    );
    this.name = 'NotificationSendError';
  }
}

function statusError(status: number): NotificationSendError {
  // 4xx names the destination; retrying it changes nothing. A 5xx or 429 is a
  // transport condition and backs off.
  if (status >= 400 && status < 500 && status !== 429) {
    return new NotificationSendError('provider_rejected');
  }
  return new NotificationSendError('transport_unavailable');
}

async function postJson(url: string, token: string, body: Record<string, unknown>): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new NotificationSendError('transport_unavailable');
  }
  if (!response.ok) {
    // Discard the body: a provider often echoes the destination.
    await response.text().catch(() => '');
    throw statusError(response.status);
  }
}

/** Email through Resend, with the HTML and plain-text alternative. */
export class ResendNotificationSender implements NotificationSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo: string | null = null,
  ) {}

  async send(to: string, payload: NotificationPayload): Promise<void> {
    await postJson('https://api.resend.com/emails', this.apiKey, {
      from: this.from,
      to,
      subject: payload.subject ?? '',
      html: payload.html ?? payload.text ?? '',
      text: payload.text ?? '',
      ...(this.replyTo ? { reply_to: this.replyTo } : {}),
      ...(payload.attachments && payload.attachments.length > 0
        ? {
            attachments: payload.attachments.map((attachment) => ({
              filename: attachment.filename,
              path: attachment.url,
            })),
          }
        : {}),
    });
  }
}

/** SMS through the provider-neutral HTTP adapter; the body is plain text. */
export class HttpSmsNotificationSender implements NotificationSender {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async send(to: string, payload: NotificationPayload): Promise<void> {
    await postJson(this.url, this.token, { to, body: payload.text ?? '' });
  }
}

/** WhatsApp through the approved-template adapter; the flier is header media. */
export class HttpWhatsAppNotificationSender implements NotificationSender {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async send(to: string, payload: NotificationPayload): Promise<void> {
    await postJson(this.url, this.token, {
      to,
      template: payload.template?.name ?? '',
      parameters: payload.template?.parameters ?? [],
      ...(payload.mediaUrl ? { mediaUrl: payload.mediaUrl } : {}),
    });
  }
}

/** Tests count calls and capture the payload; they never reach a provider. */
export interface CapturedNotification {
  channel: NotificationChannel;
  to: string;
  payload: NotificationPayload;
}

export class FakeNotificationSender implements NotificationSender {
  readonly calls: CapturedNotification[] = [];
  constructor(
    private readonly channel: NotificationChannel,
    private failure: NotificationSendError | null = null,
  ) {}

  failWith(error: NotificationSendError | null): void {
    this.failure = error;
  }

  async send(to: string, payload: NotificationPayload): Promise<void> {
    if (this.failure) throw this.failure;
    this.calls.push({ channel: this.channel, to, payload });
  }
}

export interface NotificationSenders {
  email: NotificationSender | null;
  sms: NotificationSender | null;
  whatsapp: NotificationSender | null;
}

export interface NotificationSenderConfig {
  NODE_ENV?: string;
  RESEND_API_KEY?: string;
  MAGIC_LINK_FROM?: string;
  NOTIFICATIONS_EMAIL_FROM?: string;
  WHATSAPP_SEND_URL?: string;
  SMS_SEND_URL?: string;
  MESSAGE_SEND_TOKEN?: string;
}

/** Tests get the fake; every other environment gets real adapters when wired. */
export function createNotificationSenders(config: NotificationSenderConfig): NotificationSenders {
  if (config.NODE_ENV === 'test') {
    return {
      email: new FakeNotificationSender('email'),
      sms: new FakeNotificationSender('sms'),
      whatsapp: new FakeNotificationSender('whatsapp'),
    };
  }

  const token = config.MESSAGE_SEND_TOKEN;
  const http = <T extends NotificationSender>(
    url: string | undefined,
    build: (url: string, token: string) => T,
  ): T | null => (url && token ? build(url, token) : null);

  const emailFrom = config.NOTIFICATIONS_EMAIL_FROM ?? config.MAGIC_LINK_FROM;

  return {
    email:
      config.RESEND_API_KEY && emailFrom
        ? new ResendNotificationSender(config.RESEND_API_KEY, emailFrom)
        : null,
    sms: http(config.SMS_SEND_URL, (url, value) => new HttpSmsNotificationSender(url, value)),
    whatsapp: http(
      config.WHATSAPP_SEND_URL,
      (url, value) => new HttpWhatsAppNotificationSender(url, value),
    ),
  };
}
