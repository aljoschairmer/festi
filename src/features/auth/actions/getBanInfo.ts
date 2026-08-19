"use server";

import { verifyPassword } from "better-auth/crypto";
import { prisma } from "@/lib/prisma";

/**
 * Returns ban details for the login error path (shown after better-auth
 * rejects a sign-in with BANNED_USER).
 *
 * Ban metadata must never be exposed anonymously: an unauthenticated
 * endpoint would leak account existence plus internal moderation notes
 * (reason/expiry) for any email address. The caller therefore has to prove
 * knowledge of the account's credentials — the same check better-auth
 * already passed before reporting BANNED_USER. Without valid credentials,
 * or for non-banned accounts, this returns null and reveals nothing.
 */
export async function getBanInfo(email: string, password: string) {
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
