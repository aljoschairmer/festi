"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { type MessageFormData, MessageSchema } from "../schemas";

export async function getGroupMessages(groupId: string) {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const currentMembership = await prisma.groupMember.findUnique({
    where: {
      userId_groupId: {
        userId: session.user.id,
        groupId,
      },
    },
    select: {
      status: true,
    },
  });

  if (currentMembership?.status !== "APPROVED") {
    throw new Error("You must be a member to view messages.");
  }

  const [messages, members] = await Promise.all([
    prisma.groupMessage.findMany({
      where: { groupId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            image: true,
          },
        },
      },
    }),

    prisma.groupMember.findMany({
      where: { groupId, status: "APPROVED" },
      select: {
        userId: true,
      },
    }),
  ]);

  const memberIds = new Set(members.map((member) => member.userId));

  return {
    currentUserId: session.user.id,
    // Fetched newest-first to keep the latest 100; reversed back to
    // ascending order for rendering.
    messages: messages.reverse().map((message) => ({
      id: message.id,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      isUserStillMember: memberIds.has(message.userId),
      user: message.user,
    })),
  };
}

export async function sendGroupMessage(values: MessageFormData) {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const rateLimitResult = await checkRateLimit(
    `chat:${session.user.id}`,
    30,
    60,
  );
  if (!rateLimitResult.allowed) {
    throw new Error(
      "You're sending messages too quickly. Please wait a moment.",
    );
  }

  const validatedFields = MessageSchema.safeParse(values);

  if (!validatedFields.success) {
    throw new Error(
      validatedFields.error.issues[0]?.message ?? "Invalid message.",
    );
  }

  const { groupId, content } = validatedFields.data;

  const membership = await prisma.groupMember.findUnique({
    where: {
      userId_groupId: {
        userId: session.user.id,
        groupId,
      },
    },
    select: {
      status: true,
    },
  });

  if (membership?.status !== "APPROVED") {
    throw new Error("You must be a member to send messages.");
  }

  const message = await prisma.groupMessage.create({
    data: {
      groupId,
      userId: session.user.id,
      content,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
        },
      },
    },
  });

  await Logger.log(
    ActivityAction.GROUP_MESSAGE_SENT,
    `${session.user.email} just sent a message!`,
    {
      actorId: session.user.id,
      targetType: "Group",
      targetId: groupId,
      metadata: {
        messageId: message.id,
      },
    },
  );

  return {
    id: message.id,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    user: message.user,
  };
}
