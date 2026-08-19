"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";

export type UnreadBadges = {
  notifications: number;
  messages: number;
};

const NONE: UnreadBadges = { notifications: 0, messages: 0 };

/** Both header badges in one round trip, so the two counts share an instant. */
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
