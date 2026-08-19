"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";

/** Hard cap so one query cannot pull an unbounded table into memory. */
const DEFAULT_RIDER_LIMIT = 200;

export async function getRiders() {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const users = await prisma.user.findMany({
    take: DEFAULT_RIDER_LIMIT,
    where: {
      banned: false,
      NOT: { id: session.user.id },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      createdAt: true,
      role: true,
    },
  });

  return users.map((user) => ({
    ...user,
    createdAt: user.createdAt.toISOString(),
  }));
}
