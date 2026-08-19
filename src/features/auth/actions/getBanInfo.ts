"use server";

import { verifyPassword } from "better-auth/crypto";
import { prisma } from "@/lib/prisma";
import { limitByIp } from "@/lib/rateLimit";

/**
 * Ban details for the login error path. Requires the account's credentials,
 * so it cannot be used to ask whether an address exists or why it is banned.
 * Rate limited too, because verifying credentials means running a hash.
 */
export async function getBanInfo(email: string, password: string) {
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
      accounts: {
        where: { providerId: "credential" },
        select: { password: true },
      },
    },
  });

  const hash = user?.accounts[0]?.password;
  if (!user || !hash) {
    return null;
  }

  const credentialsValid = await verifyPassword({ hash, password });
  if (!credentialsValid || !user.banned) {
    return null;
  }

  return {
    reason: user.banReason,
    expires: user.banExpires?.toISOString() ?? null,
  };
}
