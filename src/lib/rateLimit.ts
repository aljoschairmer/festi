import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Minimal fixed-window rate limiter for sensitive server actions.
 *
 * Why database-backed: the app deploys to Cloudflare Workers, where
 * in-memory counters are per-isolate and effectively useless, and adding an
 * external store (Upstash & co.) would mean a new dependency. better-auth's
 * built-in rate limit only guards its own /api/auth/* HTTP endpoints, not
 * custom server actions.
 *
 * The counter is incremented atomically in a single INSERT ... ON CONFLICT
 * statement, so concurrent requests can't race past the limit. The limiter
 * fails open on database errors (logged) — availability of core actions
 * beats strictness for this threat model (spam/cost control, not
 * credential brute force).
 */

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

// Probability of pruning stale entries on a given call, so the table can't
// grow unboundedly (registration keys are unique per ip+email pair).
const CLEANUP_PROBABILITY = 0.01;

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    if (Math.random() < CLEANUP_PROBABILITY) {
      // Fire and forget: housekeeping must never block the request.
      prisma.rateLimitEntry
        .deleteMany({
          where: {
            windowStart: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        })
        .catch((error) => console.error("[rateLimit] cleanup failed:", error));
    }

    const rows = await prisma.$queryRaw<
      Array<{ count: number; windowStart: Date }>
    >`
      INSERT INTO "rate_limit_entry" ("key", "count", "windowStart")
      VALUES (${key}, 1, NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "rate_limit_entry"."windowStart"
            <= NOW() - make_interval(secs => ${windowSeconds})
          THEN 1
          ELSE "rate_limit_entry"."count" + 1
        END,
        "windowStart" = CASE
          WHEN "rate_limit_entry"."windowStart"
            <= NOW() - make_interval(secs => ${windowSeconds})
          THEN NOW()
          ELSE "rate_limit_entry"."windowStart"
        END
      RETURNING "count", "windowStart"
    `;

    const entry = rows[0];
    if (!entry || entry.count <= limit) {
      return { allowed: true };
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        (entry.windowStart.getTime() + windowSeconds * 1000 - Date.now()) /
          1000,
      ),
    );
    return { allowed: false, retryAfterSeconds };
  } catch (error) {
    console.error("[rateLimit] check failed, allowing request:", error);
    return { allowed: true };
  }
}

/**
 * Best-effort client IP for rate-limit keys of unauthenticated actions.
 * Reads the platform headers (Cloudflare sets cf-connecting-ip; proxies set
 * x-forwarded-for). Spoofable by direct origin access, so this is a
 * speed bump, not a hard identity boundary.
 */
export async function getClientIp(): Promise<string> {
  const headerList = await headers();
  const cfIp = headerList.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return "unknown";
}
