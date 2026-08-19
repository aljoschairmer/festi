"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";

/**
 * Lets a user withdraw their own PENDING join request. No activity log is
 * written on purpose: the request never became a membership, and keeping the
 * ActivityAction enum clean was preferred over reusing OTHER.
 */
export async function cancelGroupJoinRequest(groupId: string) {
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

  if (!membership || membership.status !== "PENDING") {
    return {
      success: false as const,
      error: "You have no pending join request for this group.",
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

  revalidatePath(`/dashboard/community/g/${groupId}`);

  // Remove the unseen join-request notification to avoid request/cancel spam.
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
