/**
 * Sanitizes a `returnTo` search param into a safe in-app path.
 * Only absolute paths on this origin are allowed — anything else
 * (external URLs, protocol-relative "//host", empty values) falls back
 * to null so callers can use their default target.
 */
export function sanitizeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  return value;
}
