import { z } from 'zod';
import { dateStringSchema } from './common.js';

export const eventImportSchema = z.object({
  rows: z
    .array(
      z.object({
        date: dateStringSchema,
        eventno: z.string().min(1).max(64),
        eventname: z.string().min(1).max(128),
        ministryName: z.string().max(128).nullable().optional(),
      }),
    )
    .min(1)
    .max(10_000),
});

export const attendanceImportSchema = z.object({
  rows: z
    .array(
      z.object({
        memberno: z.string().min(1).max(32),
        date: dateStringSchema,
        eventno: z.string().min(1).max(64),
      }),
    )
    .min(1)
    .max(10_000),
});

export const importBatchSchema = z.object({
  id: z.string(),
  kind: z.enum(['events', 'attendance']),
  actor: z.string(),
  rowCount: z.number().int(),
  checksum: z.string(),
  createdAt: z.string(),
});

export const importErrorSchema = z.object({
  message: z.string(),
  rows: z.array(z.object({ row: z.number().int(), message: z.string() })).optional(),
});
