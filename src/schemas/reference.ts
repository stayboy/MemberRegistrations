import { z } from 'zod';
import { dateStringSchema } from './common.js';

export const ministryInputSchema = z.object({
  code: z.string().min(2).max(16),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
});

export const ministryUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
});

export const ministrySchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
});

export const scheduleInputSchema = z.object({
  effectiveFrom: dateStringSchema,
  rrule: z.string().min(6).max(200),
  endsOn: dateStringSchema.nullable().optional(),
});

export const createSeriesSchema = z.object({
  name: z.string().min(1).max(120),
  ministryCode: z.string().min(2).max(16).nullable().optional(),
  presbyterOnly: z.boolean().default(false),
  timezone: z.string().min(1).max(64).optional(),
  description: z.string().max(500).nullable().optional(),
  schedule: scheduleInputSchema,
});

export const updateSeriesSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  ministryCode: z.string().min(2).max(16).nullable().optional(),
  presbyterOnly: z.boolean().optional(),
  timezone: z.string().min(1).max(64).optional(),
  description: z.string().max(500).nullable().optional(),
  archived: z.boolean().optional(),
});

export const scheduleSchema = z.object({
  effectiveFrom: z.string(),
  rrule: z.string(),
  endsOn: z.string().nullable(),
});

export const seriesExceptionInputSchema = z.object({
  date: dateStringSchema,
  kind: z.enum(['cancelled', 'extra']),
  note: z.string().max(200).nullable().optional(),
});

export const seriesSchema = z.object({
  id: z.string(),
  name: z.string(),
  ministry: z.object({ code: z.string(), name: z.string() }).nullable(),
  presbyterOnly: z.boolean(),
  timezone: z.string(),
  description: z.string().nullable(),
  archivedAt: z.string().nullable(),
  schedules: z.array(scheduleSchema),
  exceptions: z.array(
    z.object({
      date: z.string(),
      kind: z.enum(['cancelled', 'extra']),
      note: z.string().nullable(),
    }),
  ),
});

export const occurrenceListSchema = z.object({
  seriesId: z.string(),
  from: z.string(),
  to: z.string(),
  dates: z.array(z.string()),
});
