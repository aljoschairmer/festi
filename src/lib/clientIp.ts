import "server-only";

import { headers } from "next/headers";

/**
 * The caller's IP, preferring headers the client cannot set. Order matters:
 * `x-forwarded-for` is forgeable, `cf-connecting-ip` is written by the edge.
 * Null outside a request scope.
 */
export async function getClientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return (
      h.get("cf-connecting-ip") ??
      h.get("true-client-ip") ??
      h.get("x-real-ip") ??
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null
    );
  } catch {
    return null;
  }
}
