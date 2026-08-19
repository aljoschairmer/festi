"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";
import { canManageGroup } from "../lib/groupRoles";
import {
  type RespondToGroupJoinRequestData,
  respondToGroupJoinRequestSchema,
} from "../schemas";

export async function respondToGroupJoinRequest(
  input: RespondToGroupJoinRequestData,
) {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false as const, error: "You must be signed in." };
  }

  const validatedFields = respondToGroupJoinRequestSchema.safeParse(input);
  if (!validatedFields.success) {
    return {
      success: false as const,
      error: validatedFields.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { groupId, memberId, approve } = validatedFields.data;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      createdById: true,
      name: true,
    },
  });

  if (!group) {
    return { success: false as const, error: "Group not found." };
  }

  // Owners and moderators respond to join requests.
  if (!(await canManageGroup(groupId, session.user.id))) {
    return {
      success: false as const,
      error:
        "Only the group owner and moderators can respond to join requests.",
    };
  }

  const member = await prisma.groupMember.findFirst({
    where: {
      id: memberId,
      groupId,
    },
    select: {
      status: true,
      userId: true,
      user: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!member) {
    return { success: false as const, error: "Join request not found." };
  }

  if (member.status !== "PENDING") {
    return {
      success: false as const,
      error: "This join request has already been handled.",
    };
  }

  revalidatePath(`/dashboard/community/g/${groupId}`);

  if (approve) {
    await prisma.groupMember.update({
      where: { id: memberId },
      data: { status: "APPROVED" },
    });

    await Logger.log(
      ActivityAction.GROUP_MEMBER_APPROVED,
      `${session.user.email} approved ${member.user.name}'s group join request.`,
      {
        actorId: session.user.id,
        targetUserId: member.userId,
        targetType: "Group",
        targetId: groupId,
      },
    );

    await Notifier.push({
      type: NotificationType.GROUP_JOIN_APPROVED,
      userId: member.userId,
      actorId: session.user.id,
      targetType: "Group",
      targetId: groupId,
      message: `Your request to join ${group.name} was approved.`,
    });

    return {
      success: true as const,
      message: `${member.user.name} is now a member of the group.`,
    };
  }

  // Reject deletes the row so the user can request to join again later.
  await prisma.groupMember.delete({
    where: { id: memberId },
  });

  await Logger.log(
    ActivityAction.GROUP_MEMBER_REJECTED,
    `${session.user.email} rejected ${member.user.name}'s group join request.`,
    {
      actorId: session.user.id,
      targetUserId: member.userId,
      targetType: "Group",
      targetId: groupId,
    },
  );

  await Notifier.push({
    type: NotificationType.GROUP_JOIN_REJECTED,
    userId: member.userId,
    actorId: session.user.id,
    targetType: "Group",
    targetId: groupId,
    message: `Your request to join ${group.name} was rejected.`,
  });

  return {
    success: true as const,
    message: `${member.user.name}'s join request was rejected.`,
  };
}
