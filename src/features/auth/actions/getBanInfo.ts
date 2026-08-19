"use server";

import { prisma } from "@/lib/prisma";
import { limitByIp } from "@/lib/rateLimit";

/**
 * Ban details for the address that just failed to sign in.
 *
 * This is unauthenticated by necessity (the user cannot log in), so it is
 * rate limited: otherwise it answers "is this address registered, and was it
 * banned, and why" for any address a caller cares to try.
 */
export async function getBanInfo(email: string) {
  const limit = await limitByIp("ban-info", { limit: 10, windowSec: 60 * 10 });
  if (!limit.allowed) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      banned: true,
      banReason: true,
      banExpires: true,
    },
  });

  if (!user?.banned) {
    return null;
  }

  return {
    reason: user.banReason,
    expires: user.banExpires?.toISOString() ?? null,
  };
}
