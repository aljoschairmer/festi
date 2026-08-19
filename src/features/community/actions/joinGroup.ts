"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/prismaErrors";
import { groupPath } from "../lib/routes";

export async function joinGroup(groupId: string) {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false as const, error: "You must be signed in." };
  }

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      createdById: true,
      name: true,
      needApproval: true,
    },
  });

  if (!group) {
    return { success: false as const, error: "Group not found." };
  }

  if (group.createdById === session.user.id) {
    return {
      success: false as const,
      error: "You cannot join your own group.",
    };
  }

  const existingMembership = await prisma.groupMember.findUnique({
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

  if (existingMembership?.status === "APPROVED") {
    return {
      success: false as const,
      error: "You are already a member of this group.",
    };
  }

  if (existingMembership?.status === "PENDING") {
    return {
      success: false as const,
      error: "Your join request is already pending.",
    };
  }

  if (group.needApproval) {
    try {
      await prisma.groupMember.create({
        data: {
          groupId,
          userId: session.user.id,
          role: "member",
          status: "PENDING",
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return {
        success: true,
        message: "Your join request has been sent to the group owner.",
      };
    }

    revalidatePath(groupPath(groupId));

    await Logger.log(
      ActivityAction.GROUP_JOIN_REQUESTED,
      `${session.user.email} requested to join a group.`,
      {
        actorId: session.user.id,
        targetType: "Group",
        targetId: groupId,
      },
    );

    await Notifier.push({
      type: NotificationType.GROUP_JOIN_REQUESTED,
      userId: group.createdById,
      actorId: session.user.id,
      targetType: "Group",
      targetId: groupId,
      message: `${session.user.name} requested to join ${group.name}`,
    });

    return {
      success: true as const,
      message: "Your join request has been sent to the group owner.",
    };
  }

  try {
    await prisma.groupMember.create({
      data: {
        groupId,
        userId: session.user.id,
        role: "member",
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { success: true, message: "You have joined the group." };
  }

  revalidatePath(groupPath(groupId));

  await Logger.log(
    ActivityAction.GROUP_JOINED,
    `${session.user.email} joined a group.`,
    {
      actorId: session.user.id,
      targetType: "Group",
      targetId: groupId,
    },
  );

  await Notifier.push({
    type: NotificationType.GROUP_JOINED,
    userId: group.createdById,
    actorId: session.user.id,
    targetType: "Group",
    targetId: groupId,
    message: group.name,
  });

  return {
    success: true as const,
    message: "You joined the group.",
  };
}
