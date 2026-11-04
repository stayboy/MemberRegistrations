import { z } from 'zod';
import { dateStringSchema } from './common.js';

const optionalText = (max: number) => z.string().max(max).nullable().optional();

const importMemberNoSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/,
    'memberNo must be 1-32 characters and contain only letters, digits, hyphens or underscores',
  );

export const memberImportSchema = z.object({
  rows: z
    .array(
      z.object({
        memberNo: importMemberNoSchema,
        firstName: z.string().min(1).max(128),
        lastName: z.string().min(1).max(128),
        otherNames: optionalText(128),
        gender: z.enum(['male', 'female', 'other', 'undisclosed']).optional(),
        dob: dateStringSchema.nullable().optional(),
        joinedOn: dateStringSchema.nullable().optional(),
        placeOfResidence: optionalText(128),
        addressLine: optionalText(256),
        isPresbyter: z.boolean().optional(),
        phone: optionalText(32),
        email: optionalText(254),
      }),
    )
    .min(1)
    .max(10_000),
});

export const attendanceImportSchema = z.object({
  eventId: z.string().uuid(),
  sessionDate: dateStringSchema,
  rows: z
    .array(
      z.object({
        memberNo: importMemberNoSchema,
        /** `YYYY-MM-DD` or a date plus a time, parsed by the repository. */
        datetime: z.string().trim().max(64).optional(),
      }),
    )
    .min(1)
    .max(10_000),
});

export const importBatchSchema = z.object({
  id: z.string(),
  kind: z.enum(['members', 'attendance', 'events']),
  actor: z.string(),
  rowCount: z.number().int(),
  checksum: z.string(),
  eventInstanceId: z.string().nullable(),
  sessionDate: z.string().nullable(),
  written: z.number().int().nullable(),
  skipped: z.number().int().nullable(),
  createdAt: z.string(),
});

export const importErrorSchema = z.object({
  message: z.string(),
  rows: z.array(z.object({ row: z.number().int(), message: z.string() })).optional(),
});
