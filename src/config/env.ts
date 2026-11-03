import { z } from 'zod';

export const DEFAULT_CORS_ORIGINS =
  'http://localhost:5173,http://127.0.0.1:4173,https://stayboy.github.io';

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
  }

  if (env.AUTH_SESSION_IDLE_MINUTES > env.AUTH_SESSION_ABSOLUTE_MINUTES) {
    throw new Error('AUTH_SESSION_IDLE_MINUTES must not exceed AUTH_SESSION_ABSOLUTE_MINUTES');
  }

  return env;
}
