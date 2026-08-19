import "server-only";

import { getClientIp } from "@/lib/clientIp";
import { prisma } from "@/lib/prisma";

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets. 0 when the call was allowed. */
  retryAfterSec: number;
};

/** Chance of pruning expired rows on a call. There is no cron in a Worker. */
const PRUNE_PROBABILITY = 0.01;

/** Fire and forget, and self-contained: housekeeping must never change the answer. */
function pruneOccasionally(): void {
  if (Math.random() >= PRUNE_PROBABILITY) return;
  try {
    void prisma.rateLimit
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => {});
  } catch {}
}

/**
 * Fixed-window counter backed by Postgres, incremented in one upsert so
 * concurrent calls cannot both read a stale count. Fails open.
 */
export async function consumeRateLimit(
  key: string,
  { limit, windowSec }: { limit: number; windowSec: number },
): Promise<RateLimitResult> {
  try {
    pruneOccasionally();

    const rows = await prisma.$queryRaw<
      Array<{ count: number; expiresAt: Date }>
    >`
      INSERT INTO "rate_limit" ("key", "count", "expiresAt")
      VALUES (${key}, 1, NOW() + ${`${windowSec} seconds`}::interval)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "rate_limit"."expiresAt" < NOW() THEN 1
          ELSE "rate_limit"."count" + 1
        END,
        "expiresAt" = CASE
          WHEN "rate_limit"."expiresAt" < NOW()
          THEN NOW() + ${`${windowSec} seconds`}::interval
          ELSE "rate_limit"."expiresAt"
        END
      RETURNING "count", "expiresAt"
    `;

    const row = rows[0];
    if (!row) return { allowed: true, retryAfterSec: 0 };

    if (row.count > limit) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000),
      );
      return { allowed: false, retryAfterSec };
    }
    return { allowed: true, retryAfterSec: 0 };
  } catch {
    return { allowed: true, retryAfterSec: 0 };
  }
}

/**
 * Rate limit by caller IP. Falls back to a shared bucket when the address is
 * unknown, which is stricter rather than laxer — the right direction.
 */
export async function limitByIp(
  scope: string,
  options: { limit: number; windowSec: number },
): Promise<RateLimitResult> {
  const ip = (await getClientIp()) ?? "unknown";
  return consumeRateLimit(`${scope}:${ip}`, options);
}

/**
 * Rate limit a signed-in user's own actions.
 *
 * Separate from {@link limitByIp} because the threat is different: this is
 * about one account flooding chat, posts or uploads, not about an anonymous
 * caller enumerating or burning quota, so the key is the user id and the
 * address does not enter into it.
 */
export async function limitByUser(
  scope: string,
  userId: string,
  options: { limit: number; windowSec: number },
): Promise<RateLimitResult> {
  return consumeRateLimit(`${scope}:${userId}`, options);
}
