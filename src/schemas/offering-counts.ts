import { z } from 'zod';
import { dateStringSchema } from './common.js';

/**
 * The operator's bulk offering cash count (phase 5). A count is one event +
 * offering + session observation; its lines are denomination values in minor
 * units times a positive piece count. Corrections supersede the current row and
 * never rewrite it.
 */

/** A denomination value in minor units, e.g. GHS 20 = 2000. Bounded well inside bigint-safe integer arithmetic. */
const denominationMinorSchema = z.number().int().positive().max(10_000_000);
const piecesSchema = z.number().int().positive().max(1_000_000);

export const offeringCountLineInputSchema = z.object({
  denominationMinor: denominationMinorSchema,
  pieces: piecesSchema,
});

export const offeringCountInputSchema = z
  .object({
    sessionDate: dateStringSchema,
    offeringId: z.string().uuid(),
    /** Defaults to the offering's current terms currency; a different value is rejected. */
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'currency must be three uppercase letters')
      .optional(),
    /** At least one denomination line; a zero total is rejected by the repository. */
    lines: z.array(offeringCountLineInputSchema).min(1).max(50),
    /** Defaults to now and must fall within the session day in the event timezone. */
    asOf: z.string().datetime({ offset: true }).optional(),
    /** Names the current non-superseded observation of this group to correct. */
    supersedesId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<number>();
    value.lines.forEach((line, index) => {
      if (seen.has(line.denominationMinor)) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', index, 'denominationMinor'],
          message: 'each denomination appears once per count',
        });
      }
      seen.add(line.denominationMinor);
    });

    const total = value.lines.reduce(
      (sum, line) => sum + BigInt(line.denominationMinor) * BigInt(line.pieces),
      0n,
    );
    if (total <= 0n) {
      ctx.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'the counted total must be positive',
      });
    }
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
      ctx.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'the counted total is too large',
      });
    }
  });

export const offeringCountQuerySchema = z.object({
  sessionDate: dateStringSchema,
  offeringId: z.string().uuid(),
});

export const offeringCountLineSchema = z.object({
  denominationMinor: z.number().int(),
  pieces: z.number().int(),
});

/** The wire observation. `totalMinor` is derived from the lines. */
export const offeringCountSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  offeringId: z.string(),
  sessionDate: z.string(),
  asOf: z.string(),
  currency: z.string(),
  termsVersion: z.number().int(),
  lines: z.array(offeringCountLineSchema),
  totalMinor: z.number().int(),
  recordedAt: z.string(),
  recordedBy: z.string(),
  supersedesId: z.string().nullable(),
  /** Derived from the unique row whose supersedesId points at this observation. */
  supersededBy: z.string().nullable(),
});

export const offeringCountListSchema = z.object({
  current: offeringCountSchema.nullable(),
  /** Newest first; includes the current row and the superseded history. */
  observations: z.array(offeringCountSchema),
});

export type OfferingCountInput = z.infer<typeof offeringCountInputSchema>;
export type OfferingCountQuery = z.infer<typeof offeringCountQuerySchema>;
export type OfferingCountLineInput = z.infer<typeof offeringCountLineInputSchema>;
export type OfferingCountLine = z.infer<typeof offeringCountLineSchema>;
export type OfferingCount = z.infer<typeof offeringCountSchema>;
export type OfferingCountList = z.infer<typeof offeringCountListSchema>;
