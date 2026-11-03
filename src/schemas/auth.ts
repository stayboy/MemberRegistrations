import { z } from 'zod';

export const magicLinkRequestSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const magicLinkAcceptedSchema = z.object({
  status: z.literal('accepted'),
});

export const exchangeRequestSchema = z.object({
  token: z.string().min(20).max(256),
});

export const sessionOfficerSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  actorId: z.string(),
});

export const exchangeResponseSchema = z.object({
  sessionToken: z.string(),
  expiresAt: z.string(),
  officer: sessionOfficerSchema,
});

export const meResponseSchema = z.object({
  officerId: z.string(),
  name: z.string(),
  email: z.string(),
  actorId: z.string(),
  expiresAt: z.string(),
});
