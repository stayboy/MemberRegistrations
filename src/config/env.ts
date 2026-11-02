import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().optional(),
  API_BEARER_TOKEN: z.string().min(8).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
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
  }

  return env;
}
