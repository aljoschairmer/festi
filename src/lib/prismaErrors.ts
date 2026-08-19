import "server-only";

/**
 * Prisma error codes we handle by name rather than by message.
 * @see https://www.prisma.io/docs/orm/reference/error-reference
 */
export const PRISMA_UNIQUE_VIOLATION = "P2002";
export const PRISMA_RECORD_NOT_FOUND = "P2025";

function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/**
 * True when a write lost a race against a concurrent identical write —
 * a double-clicked like, a doubled join request, a repeated follow.
 * Callers treat this as "already done", not as a failure.
 */
export function isUniqueViolation(error: unknown): boolean {
  return codeOf(error) === PRISMA_UNIQUE_VIOLATION;
}

/** True when an update/delete targeted a row that no longer exists. */
export function isRecordNotFound(error: unknown): boolean {
  return codeOf(error) === PRISMA_RECORD_NOT_FOUND;
}
