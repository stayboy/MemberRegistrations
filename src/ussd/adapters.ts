import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { z } from 'zod';
import { UnauthorizedError, ValidationError } from '../errors/domain-errors.js';
import type { UssdRepository } from '../repos/ussd.js';
import { normalizePhone, type UssdFrame, type UssdRender } from './pipeline.js';

const NONCE_MIN = 8;
const NONCE_MAX = 128;
const MAX_CLOCK_SKEW_SECONDS = 300;
const NONCE_MINUTES = 10;
/** The reference channel's internal screen budget: no adapter-specific cut. */
const HMAC_MAX_MSG_CHARS = 182;

/** What every provider route hands its adapter: the exact inbound frame. */
export interface UssdAdapterRequest {
  raw: Buffer;
  headers: IncomingHttpHeaders;
  ip?: string;
}

/**
 * The provider declaration. Adding provider C is one object of this shape plus
 * one registration in `buildUssdAdapters`; the machine, glossary, repositories
 * and services never change.
 */
export interface UssdAdapter {
  id: string;
  route: string;
  authenticator(request: UssdAdapterRequest): void | Promise<void>;
  toFrame(request: UssdAdapterRequest): UssdFrame | Promise<UssdFrame>;
  toWire(render: UssdRender, request: UssdAdapterRequest): unknown | Promise<unknown>;
  maxMsgChars: number;
  pageSize: { events: number; offerings: number };
}

export interface UssdAdapterDeps {
  repo: UssdRepository;
  gatewaySecret: string;
  naloUserId: string;
  naloMaxMsgChars: number;
}

const hmacBodySchema = z.object({
  phone: z.string().min(1).max(32),
  sessionId: z.string().uuid().optional(),
  input: z.string().trim().max(64).optional().default(''),
  seq: z.number().int().nonnegative(),
});

const naloBodySchema = z.object({
  USERID: z.string().min(1).max(32),
  MSISDN: z.string().min(1).max(32),
  // Nalo allows 120; the pipeline's frame carries at most 64 characters.
  USERDATA: z.string().max(64).optional().default(''),
  MSGTYPE: z.boolean(),
  NETWORK: z.string().optional(),
  SESSIONID: z.string().min(1).max(128),
});

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function readJson(raw: Buffer): unknown {
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new ValidationError('The USSD body is not valid JSON');
  }
}

function signatureValid(
  raw: Buffer,
  timestamp: string,
  nonce: string,
  signature: string,
  secret: string,
): boolean {
  const expected = Buffer.from(
    createHmac('sha256', secret).update(timestamp).update(nonce).update(raw).digest('hex'),
    'utf8',
  );
  const provided = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

/**
 * The provider's published cap is a fallback, never a layout decision: the
 * machine renders to its internal budget and this only cuts a screen that is
 * still longer than the declared cap.
 */
export function truncateMessage(text: string, maxMsgChars: number): string {
  if (text.length <= maxMsgChars) return text;
  return `${text.slice(0, Math.max(0, maxMsgChars - 1))}…`;
}

function nonceExpiry(minutes = NONCE_MINUTES): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/** The existing HMAC-signed entry, re-exposed as the reference adapter. */
export function createHmacAdapter(deps: UssdAdapterDeps): UssdAdapter {
  return {
    id: 'hmac',
    route: '/ussd/session',
    maxMsgChars: HMAC_MAX_MSG_CHARS,
    pageSize: { events: 3, offerings: 5 },
    async authenticator(request) {
      const timestamp = header(request.headers, 'x-ussd-timestamp');
      const nonce = header(request.headers, 'x-ussd-nonce');
      const signature = header(request.headers, 'x-ussd-signature');
      if (!timestamp || !nonce || !signature) {
        throw new UnauthorizedError(
          'X-USSD-Timestamp, X-USSD-Nonce and X-USSD-Signature are required',
        );
      }
      if (nonce.length < NONCE_MIN) {
        throw new UnauthorizedError(`X-USSD-Nonce must be ${NONCE_MIN}-${NONCE_MAX} characters`);
      }
      if (nonce.length > NONCE_MAX) {
        throw new UnauthorizedError(`X-USSD-Nonce must be ${NONCE_MIN}-${NONCE_MAX} characters`);
      }
      const seconds = Number(timestamp);
      if (
        !Number.isInteger(seconds) ||
        Math.abs(Math.floor(Date.now() / 1000) - seconds) > MAX_CLOCK_SKEW_SECONDS
      ) {
        throw new UnauthorizedError('X-USSD-Timestamp is outside the five-minute window');
      }
      if (!signatureValid(request.raw, timestamp, nonce, signature, deps.gatewaySecret)) {
        throw new UnauthorizedError('A valid X-USSD-Signature is required');
      }
      if (!(await deps.repo.consumeNonce(nonce, nonceExpiry()))) {
        throw new UnauthorizedError('X-USSD-Nonce was already used');
      }
    },
    toFrame(request) {
      const body = hmacBodySchema.parse(readJson(request.raw));
      return {
        phone: normalizePhone(body.phone),
        sessionId: body.sessionId,
        input: body.input,
        seq: body.seq,
      };
    },
    toWire(render) {
      return {
        sessionId: render.sessionId,
        text: truncateMessage(render.text, HMAC_MAX_MSG_CHARS),
        done: render.done,
        state: render.state,
        options: render.options,
      };
    },
  };
}

/**
 * Nalo Solutions. `USERID` is the whole authentication; there is no signature
 * and no invented shared-secret header.
 */
export function createNaloAdapter(deps: UssdAdapterDeps): UssdAdapter {
  const userId = deps.naloUserId;

  return {
    id: 'nalo',
    route: '/ussd/nalo',
    maxMsgChars: deps.naloMaxMsgChars,
    pageSize: { events: 2, offerings: 3 },
    authenticator(request) {
      const parsed = readJson(request.raw);
      const candidate =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>).USERID
          : undefined;
      if (typeof candidate !== 'string' || candidate !== userId) {
        throw new UnauthorizedError('A valid USERID is required');
      }
    },
    async toFrame(request) {
      const body = naloBodySchema.parse(readJson(request.raw));
      const existing = await deps.repo.loadSessionByExternalId({
        provider: 'nalo',
        externalId: body.SESSIONID,
      });
      return {
        phone: normalizePhone(body.MSISDN),
        sessionId: existing?.id,
        input: body.USERDATA.trim(),
        // Nalo has no frame counter: the next stored sequence advances exactly
        // once. A re-delivered money commit stays safe through the machine's
        // per-confirmation key.
        seq: existing ? existing.lastInputSeq + 1 : 1,
      };
    },
    async toWire(render, request) {
      const body = naloBodySchema.parse(readJson(request.raw));
      await deps.repo.attachExternalId(render.sessionId, {
        provider: 'nalo',
        externalId: body.SESSIONID,
      });
      return {
        USERID: body.USERID,
        MSISDN: body.MSISDN,
        MSG: truncateMessage(render.text, deps.naloMaxMsgChars),
        MSGTYPE: !render.done,
      };
    },
  };
}

/** The registry. A third provider is one adapter plus one line here. */
export function buildUssdAdapters(deps: UssdAdapterDeps): UssdAdapter[] {
  return [createHmacAdapter(deps), createNaloAdapter(deps)];
}
