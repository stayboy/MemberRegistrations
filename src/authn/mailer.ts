export interface MagicLinkMessage {
  to: string;
  link: string;
  expiresInMinutes: number;
}

/** Delivery is a port so tests never send mail and production can swap vendors. */
export interface Mailer {
  sendMagicLink(message: MagicLinkMessage): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  async sendMagicLink({ to, link, expiresInMinutes }: MagicLinkMessage): Promise<void> {
    // Development only: the link is the credential an engineer needs locally.
    // Production always uses Resend, so this never runs there.
    console.info(`[auth] magic link for ${to} (${expiresInMinutes} min): ${link}`);
  }
}

/** Tests must never send or print a credential. */
export class NullMailer implements Mailer {
  async sendMagicLink(): Promise<void> {}
}

export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async sendMagicLink({ to, link, expiresInMinutes }: MagicLinkMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to,
        subject: 'Sign in to Member Registrations',
        text: `Use this link to sign in: ${link}\n\nIt expires in ${expiresInMinutes} minutes and can be used once. If you did not request it, ignore this message.`,
        html: `<p>Use this link to sign in:</p><p><a href="${link}">Sign in to Member Registrations</a></p><p>It expires in ${expiresInMinutes} minutes and can be used once. If you did not request it, ignore this message.</p>`,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend rejected the message (${response.status}): ${detail.slice(0, 200)}`);
    }
  }
}

export function createMailer(source: {
  NODE_ENV?: string;
  RESEND_API_KEY?: string;
  MAGIC_LINK_FROM?: string;
}): Mailer {
  if (source.NODE_ENV === 'test') return new NullMailer();

  if (source.NODE_ENV === 'production') {
    if (!source.RESEND_API_KEY || !source.MAGIC_LINK_FROM) {
      throw new Error('RESEND_API_KEY and MAGIC_LINK_FROM are required in production');
    }
    return new ResendMailer(source.RESEND_API_KEY, source.MAGIC_LINK_FROM);
  }

  // Development never sends real mail, even if provider keys happen to be set.
  return new ConsoleMailer();
}
