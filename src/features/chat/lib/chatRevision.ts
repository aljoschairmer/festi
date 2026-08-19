import "server-only";

import { isOnline } from "@/features/followers/lib/presence";
import { prisma } from "@/lib/prisma";

/**
 * Changes whenever a message is added or removed. Messages are never edited,
 * so a count and the newest timestamp are enough.
 */
export async function groupChatRevision(groupId: string): Promise<string> {
  const { _count, _max } = await prisma.groupMessage.aggregate({
    where: { groupId },
    _count: { _all: true },
    _max: { createdAt: true },
  });

  return `${_count._all}:${_max.createdAt?.getTime() ?? 0}`;
}

/** Also changes when the partner's online state flips, which the header shows. */
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

    prisma.user.findUnique({
      where: { id: partnerId },
      select: { lastSeenAt: true },
    }),
  ]);

  const count = messages._count._all;
  const latest = messages._max.createdAt?.getTime() ?? 0;

  return `${count}:${latest}:${isOnline(partner?.lastSeenAt) ? 1 : 0}`;
}
