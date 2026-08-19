import "server-only";

import { headers } from "next/headers";

/**
 * The caller's IP address.
 *
 * Order matters. On Cloudflare, `cf-connecting-ip` is written by the edge and
 * cannot be set by the client; `x-forwarded-for` *can* be — a client that
 * sends its own `X-Forwarded-For` prepends a value Cloudflare then keeps.
 * Reading the forwarded header first therefore let anyone forge the address
 * recorded in the audit log and sidestep any per-IP counting built on it.
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
    // Called outside a request scope (e.g. a scheduled job).
    return null;
  }
}
