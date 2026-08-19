import "server-only";

import { prisma } from "@/lib/prisma";
import type { NotificationType } from "./types";

type PushInput = {
  /** The kind of notification. */
  type: NotificationType;
  /** Who receives the notification. */
  userId: string;
  /** Who triggered it (e.g. the follower). Skipped if equal to `userId`. */
  actorId?: string | null;
  /** Polymorphic reference to a related entity, e.g. "Group". */
  targetType?: string | null;
  targetId?: string | null;
  /** Optional human-readable summary. */
  message?: string | null;
};

type RemoveInput = {
  type: NotificationType;
  /** The recipient whose notification should be removed. */
  userId: string;
  /** Only remove notifications triggered by this actor. */
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  /** When true (default) only unseen notifications are removed. */
  onlyUnread?: boolean;
};

/**
 * Notifications for server actions. Every method is best-effort: a failure
 * is logged and swallowed, never propagated to the action that triggered it.
 */
export const Notifier = {
  async push(input: PushInput) {
    try {
      if (input.actorId && input.actorId === input.userId) return;

      await prisma.notification.create({
        data: {
          type: input.type,
          userId: input.userId,
          actorId: input.actorId ?? null,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          message: input.message ?? null,
        },
      });
    } catch (error) {
      console.error("[Notifier] Failed to push notification:", error);
    }
  },

  async remove(input: RemoveInput) {
    try {
      await prisma.notification.deleteMany({
        where: {
          type: input.type,
          userId: input.userId,
          ...(input.actorId ? { actorId: input.actorId } : {}),
          ...(input.targetType ? { targetType: input.targetType } : {}),
          ...(input.targetId ? { targetId: input.targetId } : {}),
          ...(input.onlyUnread === false ? {} : { read: false }),
        },
      });
    } catch (error) {
      console.error("[Notifier] Failed to remove notification:", error);
    }
  },
};
