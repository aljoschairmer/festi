"use server";

import { getCurrentAdmin } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";

/** Hard cap so one query cannot pull an unbounded table into memory. */
const DEFAULT_USER_LIMIT = 500;

export async function getUsers() {
  const session = await getCurrentAdmin();
  if (!session) {
    throw new Error("You are not authorized.");
  }

  const users = await prisma.user.findMany({
    take: DEFAULT_USER_LIMIT,
    orderBy: { createdAt: "desc" },
    include: {
      sessions: {
        where: {
          expiresAt: {
            gt: new Date(),
          },
        },
        select: {
          id: true,
          updatedAt: true,
          expiresAt: true,
        },
      },
    },
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role ?? "user",
    banned: user.banned ?? false,
    banReason: user.banReason,
    banExpires: user.banExpires?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),

    isOnline: user.sessions.length > 0,
    lastActiveAt: user.sessions[0]?.updatedAt.toISOString() ?? null,
  }));
}
