import "server-only";

import { isOnline } from "@/features/followers/lib/presence";
import { prisma } from "@/lib/prisma";

/**
 * Cheap "has anything changed?" tokens for the chat streams.
 *
 * Count plus newest timestamp catches inserts and deletes alike, which is
 * everything chat does to a message — they are never edited. Both queries are
 * covered by indexes added in B-08: `group_message(groupId, createdAt)` and
 * `direct_message(senderId, recipientId, createdAt)`.
 */

export async function groupChatRevision(groupId: string): Promise<string> {
  const { _count, _max } = await prisma.groupMessage.aggregate({
    where: { groupId },
    _count: { _all: true },
    _max: { createdAt: true },
  });

  return `${_count._all}:${_max.createdAt?.getTime() ?? 0}`;
}

export async function directChatRevision(
  myId: string,
  partnerId: string,
): Promise<string> {
  const [messages, partner] = await Promise.all([
    prisma.directMessage.aggregate({
      where: {
        OR: [
          { senderId: myId, recipientId: partnerId },
          { senderId: partnerId, recipientId: myId },
        ],
      },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    // The thread header shows a live online dot, so presence has to be part
    // of the token — otherwise it would only ever refresh when a message
    // happened to arrive. The derived boolean, not the raw timestamp: a
    // heartbeat every 30 seconds would otherwise look like a change every
    // 30 seconds and push the whole thread for nothing.
    prisma.user.findUnique({
      where: { id: partnerId },
      select: { lastSeenAt: true },
    }),
  ]);

  const count = messages._count._all;
  const latest = messages._max.createdAt?.getTime() ?? 0;

  return `${count}:${latest}:${isOnline(partner?.lastSeenAt) ? 1 : 0}`;
}
