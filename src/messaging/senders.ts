import { DeliveryUnavailableError } from '../errors/domain-errors.js';

/**
 * The outbound delivery ports for member verification (MR-35).
 *
 * WhatsApp, email and SMS leave the register through these interfaces only. A
 * console implementation exists outside production so a developer can read the
 * code locally; tests get a no-op; production gets Resend for email and one
 * provider-neutral HTTP adapter for WhatsApp and SMS. A production channel with
 * no configured sender is `null`, and the service refuses the issue with
 * `503 delivery_unavailable` before generating a code.
 */

/** One short message to a phone number (WhatsApp or SMS). */
export interface MessageSender {
  send(to: string, body: string): Promise<void>;
}

/** One email to an address; the sender supplies its own From identity. */
export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}

/** Development only: prints the message, including its code, to the console. */
export class ConsoleMessageSender implements MessageSender {
  constructor(private readonly channel: 'whatsapp' | 'sms') {}

  async send(to: string, body: string): Promise<void> {
    console.info(`[verification] ${this.channel} to ${to}: ${body}`);
  }
}

/** Development only: prints the message, including its code, to the console. */
export class ConsoleEmailSender implements EmailSender {
  async send(to: string, subject: string, body: string): Promise<void> {
    console.info(`[verification] email to ${to} (${subject}): ${body}`);
  }
}

/** Tests must never send or print a code. */
export class NullMessageSender implements MessageSender {
  async send(): Promise<void> {}
}

/** Tests must never send or print a code. */
export class NullEmailSender implements EmailSender {
  async send(): Promise<void> {}
}

/**
 * The provider-neutral WhatsApp/SMS adapter: POST `{ to, body }` as JSON with a
 * bearer. A missing URL or token, a transport failure or a non-2xx answer is
 * `503 delivery_unavailable`, so a misconfigured deployment never claims a send.
 */
export class HttpMessageSender implements MessageSender {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async send(to: string, body: string): Promise<void> {
    if (!this.url || !this.token) throw new DeliveryUnavailableError();

    let response: Response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to, body }),
      });
    } catch {
      throw new DeliveryUnavailableError('The message provider could not be reached');
    }

    if (!response.ok) {
      // The provider's answer may echo the destination; never carry it in the
      // error, which reaches the problem+json handler and the log.
      await response.text().catch(() => '');
      throw new DeliveryUnavailableError('The message provider refused the message');
    }
  }
}

/** Email through Resend, behind the generic port rather than the magic-link one. */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(to: string, subject: string, body: string): Promise<void> {
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to,
          subject,
          text: body,
          html: `<p>${body}</p>`,
        }),
      });
    } catch {
      throw new DeliveryUnavailableError('The email provider could not be reached');
    }

    if (!response.ok) {
      // The provider's answer may echo the address or the code; discard it and
      // answer the same 503 the transport path does.
      await response.text().catch(() => '');
      throw new DeliveryUnavailableError('The email provider refused the message');
    }
  }
}

export interface Senders {
  whatsapp: MessageSender | null;
  email: EmailSender | null;
  sms: MessageSender | null;
}

export interface SenderConfig {
  NODE_ENV?: string;
  RESEND_API_KEY?: string;
  /** The sender identity Resend posts from; the magic link uses the same one. */
  MAGIC_LINK_FROM?: string;
  WHATSAPP_SEND_URL?: string;
  SMS_SEND_URL?: string;
  MESSAGE_SEND_TOKEN?: string;
}

/**
 * Development and test never reach a provider: development prints the code,
 * tests send nothing. Production builds a sender only when its configuration is
 * complete; an incomplete channel stays `null` and the service answers 503.
 */
export function createSenders(config: SenderConfig): Senders {
  const nodeEnv = config.NODE_ENV;

  if (nodeEnv === 'test') {
    return {
      whatsapp: new NullMessageSender(),
      email: new NullEmailSender(),
      sms: new NullMessageSender(),
    };
  }

  if (nodeEnv === 'production') {
    const token = config.MESSAGE_SEND_TOKEN;
    const httpSender = (url: string | undefined): MessageSender | null =>
      url && token ? new HttpMessageSender(url, token) : null;

    return {
      whatsapp: httpSender(config.WHATSAPP_SEND_URL),
      sms: httpSender(config.SMS_SEND_URL),
      email:
        config.RESEND_API_KEY && config.MAGIC_LINK_FROM
          ? new ResendEmailSender(config.RESEND_API_KEY, config.MAGIC_LINK_FROM)
          : null,
    };
  }

  return {
    whatsapp: new ConsoleMessageSender('whatsapp'),
    email: new ConsoleEmailSender(),
    sms: new ConsoleMessageSender('sms'),
  };
}
