"use server";

import { verifyPassword } from "better-auth/crypto";
import { prisma } from "@/lib/prisma";
import { limitByIp } from "@/lib/rateLimit";

/**
 * Ban details for the login error path (shown after better-auth rejects a
 * sign-in with BANNED_USER).
 *
 * Two controls, doing different jobs:
 *
 * Ban metadata must never be readable anonymously — an open endpoint would
 * answer "does this address exist, is it banned, and why" for any address a
 * caller cares to try, moderation notes included. So the caller has to prove
 * knowledge of the credentials, the same check better-auth already passed
 * before it reported BANNED_USER. Without valid credentials, or for an
 * account that is not banned, this returns null and reveals nothing.
 *
 * That check is also why the rate limit stays: proving credentials means
 * running a password hash, so an unthrottled endpoint is both a guessing
 * oracle and a cheap way to burn CPU on a Worker.
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
