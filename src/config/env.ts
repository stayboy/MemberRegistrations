import { z } from 'zod';

export const DEFAULT_CORS_ORIGINS =
  'http://localhost:5173,http://127.0.0.1:4173,https://stayboy.github.io';

/** Tests and development use this pepper; production must override it. */
export const DEFAULT_VISITOR_PHONE_PEPPER = 'dev-only-visitor-phone-pepper';

/** Development and test defaults. Production must override every one of these. */
export const DEFAULT_USSD_GATEWAY_SECRET = 'dev-only-ussd-gateway-secret';
export const DEFAULT_USSD_PHONE_PEPPER = 'dev-only-ussd-phone-pepper';
export const DEFAULT_USSD_CODE_PEPPER = 'dev-only-ussd-code-pepper';
export const DEFAULT_USSD_NALO_USER_ID = 'NALOTest';
export const DEFAULT_USSD_NALO_MAX_MSG_CHARS = 120;
export const DEFAULT_PAYMENT_GATEWAY_SECRET = 'dev-only-payment-gateway-secret';

/** The HMAC pepper every verification code is stored under (MR-25). */
export const DEFAULT_OTP_PEPPER = 'dev-only-otp-pepper';

/** Ghana (233) unless the deployment says otherwise; 1-3 digits (MR-24). */
export const DEFAULT_COUNTRY_CODE = '233';

/** Encrypts a pending registration's number; production must override it (MR-53). */
export const DEFAULT_REGISTRATION_PHONE_KEY = 'dev-only-registration-phone-key';

/** The member acceptance page; the SMS carries `${base}#t=<token>` (MR-51). */
export const DEFAULT_VERIFICATION_LINK_BASE = 'http://localhost:5173/v';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().optional(),
  API_BEARER_TOKEN: z.string().min(8).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  AUTH_MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  AUTH_SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(480),
  AUTH_SESSION_ABSOLUTE_MINUTES: z.coerce.number().int().positive().default(720),
  UI_BASE_URL: z.string().url().default('http://localhost:5173/#/connect'),
  RESEND_API_KEY: z.string().min(1).optional(),
  MAGIC_LINK_FROM: z.string().email().optional(),
  CORS_ALLOWED_ORIGINS: z.string().default(DEFAULT_CORS_ORIGINS),
  // Production must override this; rotating it changes every stored visitor hash.
  VISITOR_PHONE_PEPPER: z.string().min(16).default(DEFAULT_VISITOR_PHONE_PEPPER),
  // USSD stays off in production until a real aggregator exists.
  USSD_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  USSD_GATEWAY_SECRET: z.string().min(16).default(DEFAULT_USSD_GATEWAY_SECRET),
  USSD_PHONE_PEPPER: z.string().min(16).default(DEFAULT_USSD_PHONE_PEPPER),
  USSD_CODE_PEPPER: z.string().min(16).default(DEFAULT_USSD_CODE_PEPPER),
  // A client identifier, not a secret: it does not take the .min(16) secret rule.
  USSD_NALO_USER_ID: z.string().min(1).max(32).default(DEFAULT_USSD_NALO_USER_ID),
  USSD_NALO_MAX_MSG_CHARS: z.coerce
    .number()
    .int()
    .min(1)
    .max(182)
    .default(DEFAULT_USSD_NALO_MAX_MSG_CHARS),
  // The callback is authenticated by HMAC only, so a public development secret
  // would let anyone forge it; the route stays unmounted until a real gateway.
  PAYMENTS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  PAYMENT_GATEWAY_SECRET: z.string().min(16).default(DEFAULT_PAYMENT_GATEWAY_SECRET),
  // Codes are stored only as an HMAC; production must override this default.
  OTP_PEPPER: z.string().min(16).default(DEFAULT_OTP_PEPPER),
  // Prefixes a bare stored number for delivery and masking; the stored value is
  // never rewritten (MR-24).
  DEFAULT_COUNTRY_CODE: z
    .string()
    .regex(/^\d{1,3}$/)
    .default(DEFAULT_COUNTRY_CODE),
  // The provider-neutral HTTP adapters for WhatsApp and SMS (MR-35). Unset in
  // production means the channel has no sender and the issue is a 503.
  WHATSAPP_SEND_URL: z.string().url().optional(),
  SMS_SEND_URL: z.string().url().optional(),
  MESSAGE_SEND_TOKEN: z.string().min(1).optional(),
  // AES-256-GCM key material for a pending registration's number; production
  // must override the development default (MR-53).
  REGISTRATION_PHONE_KEY: z.string().min(16).default(DEFAULT_REGISTRATION_PHONE_KEY),
  // The public member acceptance page, outside the officer `#/` router. The SMS
  // appends `#t=<token>`; production has no safe default (MR-51).
  VERIFICATION_LINK_BASE: z.string().url().default(DEFAULT_VERIFICATION_LINK_BASE),
  // The flier store (notification spec N-9). `db` keeps the bytes in the
  // register so a clone with no bucket still runs; `s3` is MinIO in Compose and
  // R2 (or any S3 target) hosted. Path-style addressing is what MinIO requires.
  FLIER_STORE: z.enum(['db', 's3']).default('db'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().min(1).max(255).optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(env)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${detail}`);
  }

  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (!env.API_BEARER_TOKEN)
      throw new Error('API_BEARER_TOKEN is required when NODE_ENV=production');
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required when NODE_ENV=production');
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required when NODE_ENV=production');
    if (!env.MAGIC_LINK_FROM)
      throw new Error('MAGIC_LINK_FROM is required when NODE_ENV=production');
    if (env.VISITOR_PHONE_PEPPER === DEFAULT_VISITOR_PHONE_PEPPER) {
      throw new Error('VISITOR_PHONE_PEPPER is required when NODE_ENV=production');
    }
    if (env.OTP_PEPPER === DEFAULT_OTP_PEPPER) {
      throw new Error('OTP_PEPPER is required when NODE_ENV=production');
    }
    if (env.REGISTRATION_PHONE_KEY === DEFAULT_REGISTRATION_PHONE_KEY) {
      throw new Error('REGISTRATION_PHONE_KEY is required when NODE_ENV=production');
    }
    if (env.VERIFICATION_LINK_BASE === DEFAULT_VERIFICATION_LINK_BASE) {
      throw new Error('VERIFICATION_LINK_BASE is required when NODE_ENV=production');
    }
    if (env.USSD_ENABLED) {
      if (env.USSD_GATEWAY_SECRET === DEFAULT_USSD_GATEWAY_SECRET) {
        throw new Error('USSD_GATEWAY_SECRET is required when NODE_ENV=production');
      }
      if (env.USSD_PHONE_PEPPER === DEFAULT_USSD_PHONE_PEPPER) {
        throw new Error('USSD_PHONE_PEPPER is required when NODE_ENV=production');
      }
      if (env.USSD_CODE_PEPPER === DEFAULT_USSD_CODE_PEPPER) {
        throw new Error('USSD_CODE_PEPPER is required when NODE_ENV=production');
      }
      if (env.USSD_NALO_USER_ID === DEFAULT_USSD_NALO_USER_ID) {
        throw new Error('USSD_NALO_USER_ID is required when NODE_ENV=production');
      }
      throw new Error(
        'USSD_ENABLED must be false when NODE_ENV=production until a real aggregator exists',
      );
    }
    if (env.PAYMENTS_ENABLED && env.PAYMENT_GATEWAY_SECRET === DEFAULT_PAYMENT_GATEWAY_SECRET) {
      throw new Error('PAYMENT_GATEWAY_SECRET is required when NODE_ENV=production');
    }
    if (env.FLIER_STORE === 's3') {
      if (
        !env.S3_ENDPOINT ||
        !env.S3_BUCKET ||
        !env.S3_ACCESS_KEY_ID ||
        !env.S3_SECRET_ACCESS_KEY
      ) {
        throw new Error(
          'S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when FLIER_STORE=s3',
        );
      }
    }
  }

  if (env.AUTH_SESSION_IDLE_MINUTES > env.AUTH_SESSION_ABSOLUTE_MINUTES) {
    throw new Error('AUTH_SESSION_IDLE_MINUTES must not exceed AUTH_SESSION_ABSOLUTE_MINUTES');
  }

  return env;
}
