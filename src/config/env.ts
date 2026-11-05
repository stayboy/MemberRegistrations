import { z } from 'zod';

export const DEFAULT_CORS_ORIGINS =
  'http://localhost:5173,http://127.0.0.1:4173,https://stayboy.github.io';

/** Tests and development use this pepper; production must override it. */
export const DEFAULT_VISITOR_PHONE_PEPPER = 'dev-only-visitor-phone-pepper';

/** Development and test defaults. Production must override every one of these. */
export const DEFAULT_USSD_GATEWAY_SECRET = 'dev-only-ussd-gateway-secret';
export const DEFAULT_USSD_PHONE_PEPPER = 'dev-only-ussd-phone-pepper';
export const DEFAULT_USSD_CODE_PEPPER = 'dev-only-ussd-code-pepper';
export const DEFAULT_PAYMENT_GATEWAY_SECRET = 'dev-only-payment-gateway-secret';

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
  PAYMENT_GATEWAY_SECRET: z.string().min(16).default(DEFAULT_PAYMENT_GATEWAY_SECRET),
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
    if (env.USSD_GATEWAY_SECRET === DEFAULT_USSD_GATEWAY_SECRET) {
      throw new Error('USSD_GATEWAY_SECRET is required when NODE_ENV=production');
    }
    if (env.USSD_PHONE_PEPPER === DEFAULT_USSD_PHONE_PEPPER) {
      throw new Error('USSD_PHONE_PEPPER is required when NODE_ENV=production');
    }
    if (env.USSD_CODE_PEPPER === DEFAULT_USSD_CODE_PEPPER) {
      throw new Error('USSD_CODE_PEPPER is required when NODE_ENV=production');
    }
    if (env.PAYMENT_GATEWAY_SECRET === DEFAULT_PAYMENT_GATEWAY_SECRET) {
      throw new Error('PAYMENT_GATEWAY_SECRET is required when NODE_ENV=production');
    }
    if (env.USSD_ENABLED) {
      throw new Error(
        'USSD_ENABLED must be false when NODE_ENV=production until a real aggregator exists',
      );
    }
  }

  if (env.AUTH_SESSION_IDLE_MINUTES > env.AUTH_SESSION_ABSOLUTE_MINUTES) {
    throw new Error('AUTH_SESSION_IDLE_MINUTES must not exceed AUTH_SESSION_ABSOLUTE_MINUTES');
  }

  return env;
}
