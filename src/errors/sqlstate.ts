/**
 * Drizzle wraps driver failures in `DrizzleQueryError`; the SQLSTATE is on the
 * cause. Handle both shapes so mapping works on `pg` and PGlite.
 */
export function sqlState(error: unknown): string | undefined {
  const direct = (error as { code?: unknown } | null)?.code;
  if (typeof direct === 'string') return direct;
  const cause = (error as { cause?: unknown } | null)?.cause;
  const inherited = (cause as { code?: unknown } | null)?.code;
  return typeof inherited === 'string' ? inherited : undefined;
}

/** The violating constraint name, read through Drizzle's wrapper when present. */
export function sqlConstraint(error: unknown): string | undefined {
  const direct = (error as { constraint?: unknown } | null)?.constraint;
  if (typeof direct === 'string') return direct;
  const cause = (error as { cause?: unknown } | null)?.cause;
  const inherited = (cause as { constraint?: unknown } | null)?.constraint;
  return typeof inherited === 'string' ? inherited : undefined;
}
