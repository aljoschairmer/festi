"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { isOnline } from "@/features/followers/lib/presence";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { prisma } from "@/lib/prisma";
import { limitByUser } from "@/lib/rateLimit";
import { type DirectMessageFormData, DirectMessageSchema } from "../schemas";

const partnerSelect = {
  id: true,
  name: true,
  username: true,
  image: true,
  lastSeenAt: true,
} as const;

/** Returns true when `me` and `other` follow each other. */
async function areMutualFollowers(me: string, other: string) {
  if (me === other) return false;

  const links = await prisma.follow.findMany({
    where: {
      OR: [
        { followerId: me, followingId: other },
        { followerId: other, followingId: me },
      ],
    },
    select: { followerId: true, followingId: true },
  });

  const iFollow = links.some(
    (link) => link.followerId === me && link.followingId === other,
  );
  const followsMe = links.some(
    (link) => link.followerId === other && link.followingId === me,
  );

  return iFollow && followsMe;
}

export type DirectConversation = {
  partner: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
    isOnline: boolean;
  };
  lastMessage: {
    content: string;
    createdAt: string;
    fromMe: boolean;
  } | null;
  unreadCount: number;
};

/**
 * Lists every user the current user has ever exchanged a direct message with,
 * most recent conversation first, with a preview of the last message.
 */
export async function getDirectConversations(): Promise<DirectConversation[]> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const myId = session.user.id;

  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [{ senderId: myId }, { recipientId: myId }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      content: true,
      createdAt: true,
      senderId: true,
      recipientId: true,
      readAt: true,
    },
  });

  const partnerIds: string[] = [];
  const lastByPartner = new Map<string, (typeof messages)[number]>();
  const unreadByPartner = new Map<string, number>();

  for (const message of messages) {
    const partnerId =
      message.senderId === myId ? message.recipientId : message.senderId;

    if (!lastByPartner.has(partnerId)) {
      lastByPartner.set(partnerId, message);
      partnerIds.push(partnerId);
    }

    if (message.recipientId === myId && message.readAt === null) {
      unreadByPartner.set(partnerId, (unreadByPartner.get(partnerId) ?? 0) + 1);
    }
  }

  if (partnerIds.length === 0) return [];

  const partners = await prisma.user.findMany({
    where: { id: { in: partnerIds } },
    select: partnerSelect,
  });

  const partnerById = new Map(partners.map((partner) => [partner.id, partner]));

  return partnerIds
    .map((partnerId) => {
      const partner = partnerById.get(partnerId);
      if (!partner) return null;
      const last = lastByPartner.get(partnerId);

      return {
        partner: {
          id: partner.id,
          name: partner.name,
          username: partner.username,
          image: partner.image,
          isOnline: isOnline(partner.lastSeenAt),
        },
        lastMessage: last
          ? {
              content: last.content,
              createdAt: last.createdAt.toISOString(),
              fromMe: last.senderId === myId,
            }
          : null,
        unreadCount: unreadByPartner.get(partnerId) ?? 0,
      } satisfies DirectConversation;
    })
    .filter(
      (conversation): conversation is DirectConversation =>
        conversation !== null,
    );
}

export type DirectMessagesResult = {
  currentUserId: string;
  partner: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
    isOnline: boolean;
  };
  canMessage: boolean;
  messages: {
    id: string;
    content: string;
    createdAt: string;
    fromMe: boolean;
  }[];
};

/**
 * Fetches the conversation between the current user and `partnerId`, and marks
 * any messages the partner sent to me as read.
 */
export async function getDirectMessages(
  partnerId: string,
): Promise<DirectMessagesResult> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const myId = session.user.id;

  const partner = await prisma.user.findUnique({
    where: { id: partnerId },
    select: partnerSelect,
  });

  if (!partner) {
    throw new Error("User not found.");
  }

  const [messages, canMessage] = await Promise.all([
    prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: myId, recipientId: partnerId },
          { senderId: partnerId, recipientId: myId },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        content: true,
        createdAt: true,
        senderId: true,
      },
    }),
    areMutualFollowers(myId, partnerId),
  ]);

  await prisma.directMessage.updateMany({
    where: { senderId: partnerId, recipientId: myId, readAt: null },
    data: { readAt: new Date() },
  });

  return {
    currentUserId: myId,
    partner: {
      id: partner.id,
      name: partner.name,
      username: partner.username,
      image: partner.image,
      isOnline: isOnline(partner.lastSeenAt),
    },
    canMessage,

    messages: messages.reverse().map((message) => ({
      id: message.id,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      fromMe: message.senderId === myId,
    })),
  };
}

export async function sendDirectMessage(values: DirectMessageFormData) {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const rateLimitResult = await limitByUser("chat", session.user.id, {
    limit: 30,
    windowSec: 60,
  });
  if (!rateLimitResult.allowed) {
    throw new Error(
      "You're sending messages too quickly. Please wait a moment.",
    );
  }

  const validatedFields = DirectMessageSchema.safeParse(values);
  if (!validatedFields.success) {
    throw new Error(
      validatedFields.error.issues[0]?.message ?? "Invalid message.",
    );
  }

  const { recipientId, content } = validatedFields.data;
  const myId = session.user.id;

  if (recipientId === myId) {
    throw new Error("You cannot message yourself.");
  }

  const canMessage = await areMutualFollowers(myId, recipientId);
  if (!canMessage) {
    throw new Error("You can only message people who follow you back.");
  }

  const message = await prisma.directMessage.create({
    data: {
      senderId: myId,
      recipientId,
      content,
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
      senderId: true,
    },
  });

  await Logger.log(
    ActivityAction.DIRECT_MESSAGE_SENT,
    `${session.user.email} sent a direct message.`,
    {
      actorId: myId,
      targetUserId: recipientId,
      targetType: "DirectMessage",
      targetId: message.id,
    },
  );

  return {
    id: message.id,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    fromMe: true,
  };
}
