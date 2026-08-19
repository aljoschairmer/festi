"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";
import { groupPath } from "../lib/routes";

export async function leaveGroup(groupId: string) {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false as const, error: "You must be signed in." };
  }

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      createdById: true,
    },
  });

  if (!group) {
    return { success: false as const, error: "Group not found." };
  }

  if (group.createdById === session.user.id) {
    return {
      success: false as const,
      error: "Owners cannot leave their own group.",
    };
  }

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

  if (!membership) {
    return {
      success: false as const,
      error: "You are not a member of this group.",
    };
  }

  await prisma.groupMember.delete({
    where: {
      userId_groupId: {
        userId: session.user.id,
        groupId,
      },
    },
  });

  revalidatePath(groupPath(groupId));

  if (membership.status === "PENDING") {
    await Notifier.remove({
      type: NotificationType.GROUP_JOIN_REQUESTED,
      userId: group.createdById,
      actorId: session.user.id,
      targetType: "Group",
      targetId: groupId,
    });

    return {
      success: true as const,
      message: "Your join request has been cancelled.",
    };
  }

  await Logger.log(
    ActivityAction.GROUP_LEFT,
    `${session.user.email} left a group.`,
    {
      actorId: session.user.id,
      targetType: "Group",
      targetId: groupId,
    },
  );

  await Notifier.remove({
    type: NotificationType.GROUP_JOINED,
    userId: group.createdById,
    actorId: session.user.id,
    targetType: "Group",
    targetId: groupId,
  });

  return {
    success: true as const,
    message: "You left the group.",
  };
}
