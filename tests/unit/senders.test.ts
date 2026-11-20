import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConsoleEmailSender,
  ConsoleMessageSender,
  HttpMessageSender,
  ResendEmailSender,
  createSenders,
} from '../../src/messaging/senders.js';

/**
 * MR-35: both production adapters answer `503 delivery_unavailable` for a
 * transport failure and for a non-2xx reply, and neither echoes the provider's
 * body (which may name the destination or the code) into the error.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The rejection a sender raised, for asserting on its code and its message. */
async function rejectionOf(promise: Promise<void>): Promise<Error & { code?: string }> {
  try {
    await promise;
  } catch (error) {
    return error as Error & { code?: string };
  }
  throw new Error('The sender resolved, but the test expected a rejection.');
}

describe('ResendEmailSender', () => {
  const sender = new ResendEmailSender('re_test_key', 'noreply@example.test');

  it('posts the generic message and resolves on a 2xx answer', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await sender.send('ama@example.test', 'Verify your membership', 'Your code is 123456');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      from: 'noreply@example.test',
      to: 'ama@example.test',
      subject: 'Verify your membership',
      text: 'Your code is 123456',
      html: '<p>Your code is 123456</p>',
    });
  });

  it('answers delivery_unavailable when the transport rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    await expect(
      sender.send('ama@example.test', 'Verify your membership', 'Your code is 123456'),
    ).rejects.toMatchObject({ code: 'delivery_unavailable' });
  });

  it('answers delivery_unavailable on a non-2xx reply and discards its body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('recipient ama@example.test code 123456 rejected', { status: 422 }),
      ),
    );

    const error = await rejectionOf(
      sender.send('ama@example.test', 'Verify your membership', 'Your code is 123456'),
    );

    expect(error).toMatchObject({ code: 'delivery_unavailable' });
    expect(error.message).not.toContain('123456');
    expect(error.message).not.toContain('ama@example.test');
  });
});

describe('HttpMessageSender', () => {
  const sender = new HttpMessageSender('https://messages.example.test/sms', 'provider-token');

  it('posts { to, body } with the bearer and resolves on a 2xx answer', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await sender.send('2338041000203', 'Your code is 123456');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://messages.example.test/sms');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer provider-token');
    expect(JSON.parse(String(init.body))).toEqual({
      to: '2338041000203',
      body: 'Your code is 123456',
    });
  });

  it('answers delivery_unavailable when the transport rejects or the reply is not 2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    await expect(sender.send('2338041000203', 'body')).rejects.toMatchObject({
      code: 'delivery_unavailable',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('2338041000203 rejected', { status: 500 })),
    );
    const error = await rejectionOf(sender.send('2338041000203', 'body'));
    expect(error).toMatchObject({ code: 'delivery_unavailable' });
    expect(error.message).not.toContain('2338041000203');
  });
});

describe('createSenders (MR-35)', () => {
  it('sends nothing under test, so no code can be printed or posted', () => {
    const senders = createSenders({ NODE_ENV: 'test' });
    expect(senders.email).not.toBeInstanceOf(ConsoleEmailSender);
    expect(senders.whatsapp).not.toBeInstanceOf(HttpMessageSender);
    expect(senders.sms).not.toBeInstanceOf(HttpMessageSender);
    expect(senders.email).toBeTruthy();
    expect(senders.whatsapp).toBeTruthy();
    expect(senders.sms).toBeTruthy();
  });

  it('uses the console implementations outside production', () => {
    const senders = createSenders({ NODE_ENV: 'development' });
    expect(senders.email).toBeInstanceOf(ConsoleEmailSender);
    expect(senders.whatsapp).toBeInstanceOf(ConsoleMessageSender);
    expect(senders.sms).toBeInstanceOf(ConsoleMessageSender);
  });

  it('builds only the configured production channels and leaves the rest null', () => {
    const emailOnly = createSenders({
      NODE_ENV: 'production',
      RESEND_API_KEY: 're_key',
      MAGIC_LINK_FROM: 'noreply@example.test',
    });
    expect(emailOnly.email).toBeInstanceOf(ResendEmailSender);
    expect(emailOnly.whatsapp).toBeNull();
    expect(emailOnly.sms).toBeNull();

    const all = createSenders({
      NODE_ENV: 'production',
      RESEND_API_KEY: 're_key',
      MAGIC_LINK_FROM: 'noreply@example.test',
      WHATSAPP_SEND_URL: 'https://messages.example.test/whatsapp',
      SMS_SEND_URL: 'https://messages.example.test/sms',
      MESSAGE_SEND_TOKEN: 'provider-token',
    });
    expect(all.email).toBeInstanceOf(ResendEmailSender);
    expect(all.whatsapp).toBeInstanceOf(HttpMessageSender);
    expect(all.sms).toBeInstanceOf(HttpMessageSender);
  });

  it('needs the bearer as well as the URL for the HTTP adapters', () => {
    const senders = createSenders({
      NODE_ENV: 'production',
      SMS_SEND_URL: 'https://messages.example.test/sms',
    });
    expect(senders.sms).toBeNull();
  });
});
