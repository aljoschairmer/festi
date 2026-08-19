"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";

export type UnreadBadges = {
  notifications: number;
  messages: number;
};

const NONE: UnreadBadges = { notifications: 0, messages: 0 };

/**
 * Both header badges in one round trip.
 *
 * The notification bell and the message button used to poll two separate
 * server actions every 10 seconds. Each did its own `getCurrentUser()` — a
 * session lookup against the database — before running a one-row `count`, so
 * an idle tab cost 12 invocations and 12 session lookups per minute for two
 * numbers that are always rendered side by side. Fetching them together
 * halves that, and the two counts are now guaranteed to come from the same
 * instant instead of drifting up to 10 seconds apart.
 */
export async function getUnreadBadges(): Promise<UnreadBadges> {
  const session = await getCurrentUser();
  if (!session) return NONE;

  const userId = session.user.id;
  const [notifications, messages] = await Promise.all([
    prisma.notification.count({ where: { userId, read: false } }),
    prisma.directMessage.count({
      where: { recipientId: userId, readAt: null },
    }),
  ]);

  return { notifications, messages };
}
