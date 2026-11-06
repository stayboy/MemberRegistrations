import { createHmac } from 'node:crypto';
import { ValidationError } from '../errors/domain-errors.js';
import type { UssdRepository, UssdSessionRow } from '../repos/ussd.js';
import { t } from './glossary.js';
import {
  advance,
  render,
  type Rendered,
  type UssdOption,
  type UssdServices,
  type UssdSessionInfo,
  type UssdState,
} from './machine.js';

/** The channel-neutral frame every provider adapter maps its wire onto. */
export interface UssdFrame {
  phone: string;
  sessionId?: string;
  input: string;
  seq: number;
}

/** The internal render every adapter maps back to its own wire DTO. */
export interface UssdRender {
  sessionId: string;
  text: string;
  done: boolean;
  state: UssdState;
  options: UssdOption[];
}

export interface UssdPipelineDeps {
  repo: UssdRepository;
  services: UssdServices;
  phonePepper: string;
}

export interface UssdPipelineOptions {
  pageSize: { events: number; offerings: number };
  ip?: string;
}

export const SESSION_IDLE_MINUTES = 3;
export const PHONE_LIMIT = 10;
export const IP_LIMIT = 30;

/** A fixed-window limit tripped; the route maps it to `429 rate_limited`. */
export class UssdRateLimitError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = 'UssdRateLimitError';
  }
}

/** Digits only, with leading zeros removed; the stored-contact form. */
export function normalizePhone(value: string): string {
  const digits = value.trim().replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < 7 || digits.length > 20) {
    throw new ValidationError('phone must contain 7-20 digits');
  }
  return digits;
}

function expiresAt(minutes = SESSION_IDLE_MINUTES): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function sessionInfo(
  phone: string,
  phoneHash: string,
  member: Awaited<ReturnType<UssdRepository['findOwnedMember']>>,
  pageSize: { events: number; offerings: number },
): UssdSessionInfo {
  return {
    phone,
    phoneHash,
    member,
    anonymous: member === null,
    pageSize,
  };
}

/**
 * The one session pipeline. Every provider adapter supplies only a frame and
 * its declared page size; the machine, glossary, repositories and services are
 * shared, so a new dialect never forks the menu tree.
 */
export async function runUssdFrame(
  frame: UssdFrame,
  deps: UssdPipelineDeps,
  options: UssdPipelineOptions,
): Promise<UssdRender> {
  const { repo, services, phonePepper } = deps;
  const phone = frame.phone;
  const phoneHash = createHmac('sha256', phonePepper).update(phone).digest('hex');

  // Fixed-window counters live in Postgres, keyed by the phone hash and the
  // client address; rejecting here writes no session rows.
  if (!(await repo.consumeRateLimit(`ussd:phone:${phoneHash}`, PHONE_LIMIT, 1))) {
    throw new UssdRateLimitError('Too many USSD frames for this phone.');
  }
  if (!(await repo.consumeRateLimit(`ussd:ip:${options.ip ?? 'unknown'}`, IP_LIMIT, 1))) {
    throw new UssdRateLimitError('Too many USSD frames from this address.');
  }

  const member = await repo.findOwnedMember(phone);
  const info = sessionInfo(phone, phoneHash, member, options.pageSize);
  const input = frame.input.trim();

  let session: UssdSessionRow | null = null;
  let expiredNotice = false;
  if (frame.sessionId) {
    const loaded = await repo.loadSession(frame.sessionId);
    if (loaded && loaded.phoneHash === phoneHash) {
      if (new Date(loaded.expiresAt).getTime() > Date.now()) {
        session = loaded;
      } else {
        await repo.resetSession(loaded.id, { lastInputSeq: frame.seq });
        session = await repo.loadSession(loaded.id);
        expiredNotice = true;
      }
    } else {
      expiredNotice = true;
    }
  }

  if (!session) {
    const id = await repo.createSession({
      phoneHash,
      memberId: member?.id ?? null,
      anonymous: member === null,
    });
    session = await repo.loadSession(id);
  }

  let state = (session!.state as UssdState) ?? 'main';
  let context = session!.context;
  let lastInputSeq = session!.lastInputSeq;
  let rendered: Rendered;
  let done = false;

  if (expiredNotice) {
    const main = render('main', {}, info, services);
    state = 'main';
    context = {};
    lastInputSeq = frame.seq;
    rendered = { ...main, text: `${t('error.session_expired')}\n${main.text}` };
  } else if (input === '') {
    // The provider's opening frame carries no keypress; render the current
    // screen and do not count it as an invalid choice.
    rendered = render(state, context, info, services);
    if (session!.lastInputSeq === 0) lastInputSeq = frame.seq;
  } else if (frame.seq <= session!.lastInputSeq) {
    // A repeated frame returns the current prompt and never advances or charges.
    rendered = render(state, context, info, services);
  } else {
    const result = await advance(state, context, input, info, services);
    state = result.state;
    context = result.context;
    lastInputSeq = frame.seq;
    done = result.done;
    if (result.text !== undefined) {
      rendered = { state, text: result.text, done, options: [], context };
    } else {
      rendered = render(state, context, info, services);
    }
  }

  done = done || rendered.done;
  await repo.touchSession(session!.id, {
    state,
    context,
    lastInputSeq,
    expiresAt: expiresAt(),
  });

  return {
    sessionId: session!.id,
    text: rendered.text,
    done,
    state,
    options: rendered.options,
  };
}
