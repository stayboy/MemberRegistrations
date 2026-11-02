import { z } from 'zod';

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: z.string(),
});

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number(),
});

export const memberNoParamSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/,
    'memberNo must be 1-32 characters and contain only letters, digits, hyphens or underscores',
  );

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');
