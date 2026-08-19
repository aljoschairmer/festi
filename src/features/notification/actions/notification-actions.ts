"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";
import type { NotificationType } from "../types";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  message: string | null;
  read: boolean;
  createdAt: string;
  targetType: string | null;
  targetId: string | null;
  actor: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
  } | null;
};

/** Lists the current user's notifications, newest first. */
export async function getNotifications(): Promise<NotificationItem[]> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      actor: {
        select: { id: true, name: true, username: true, image: true },
      },
    },
  });

  return notifications.map((notification) => ({
    id: notification.id,
    type: notification.type,
    message: notification.message,
    read: notification.read,
    createdAt: notification.createdAt.toISOString(),
    targetType: notification.targetType,
    targetId: notification.targetId,
    actor: notification.actor,
  }));
}

export type NotificationCursor = { createdAt: string; id: string };

export type NotificationHistoryPage = {
  items: NotificationItem[];
  nextCursor: NotificationCursor | null;
};

/**
 * Full notification history for the notifications page, paginated with a
 * (createdAt, id) cursor, newest first.
 */
export async function getNotificationHistory(
  cursor?: NotificationCursor,
  limit = 30,
): Promise<NotificationHistoryPage> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const notifications = await prisma.notification.findMany({
    where: {
      userId: session.user.id,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      actor: {
        select: { id: true, name: true, username: true, image: true },
      },
    },
  });

  const hasMore = notifications.length > limit;
  const page = notifications.slice(0, limit);
  const last = page[page.length - 1];

  return {
    items: page.map((notification) => ({
      id: notification.id,
      type: notification.type,
      message: notification.message,
      read: notification.read,
      createdAt: notification.createdAt.toISOString(),
      targetType: notification.targetType,
      targetId: notification.targetId,
      actor: notification.actor,
    })),
    nextCursor:
      hasMore && last
        ? { createdAt: last.createdAt.toISOString(), id: last.id }
        : null,
  };
}

export async function markNotificationsSeen(): Promise<void> {
  const session = await getCurrentUser();
  if (!session) return;

  await prisma.notification.updateMany({
    where: { userId: session.user.id, read: false },
    data: { read: true },
  });
}
