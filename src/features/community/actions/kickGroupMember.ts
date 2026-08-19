"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { prisma } from "@/lib/prisma";
import { getGroupRole } from "../lib/groupRoles";

export async function kickGroupMember(input: {
  groupId: string;
  memberId: string;
}) {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false as const, error: "You must be signed in." };
  }

  const group = await prisma.group.findUnique({
    where: { id: input.groupId },
    select: {
      createdById: true,
    },
  });

  if (!group) {
    return { success: false as const, error: "Group not found." };
  }

  const member = await prisma.groupMember.findUnique({
    where: { id: input.memberId },
    select: {
      userId: true,
      role: true,
      user: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!member) {
    return { success: false as const, error: "Member not found." };
  }

  // The owner can kick anyone (except themselves); moderators can kick
  // regular members only.
  const isOwner = group.createdById === session.user.id;
  const callerRole = await getGroupRole(input.groupId, session.user.id);

  if (!isOwner) {
    if (callerRole !== "moderator") {
      return {
        success: false as const,
        error: "Only the group owner and moderators can kick members.",
      };
    }
    if (member.role !== "member") {
      return {
        success: false as const,
        error: "Moderators can only kick regular members.",
      };
    }
  }

  if (member.userId === group.createdById) {
    return {
      success: false as const,
      error: "You cannot kick the group owner.",
    };
  }

  await prisma.groupMember.delete({
    where: {
      id: input.memberId,
    },
  });

  revalidatePath(`/dashboard/community/g/${input.groupId}`);

  await Logger.log(
    ActivityAction.GROUP_MEMBER_REMOVED,
    `${session.user.email} kicked ${member.user.name} from a group.`,
    {
      actorId: session.user.id,
      targetUserId: member.userId,
      targetType: "Group",
      targetId: input.groupId,
    },
  );

  return {
    success: true as const,
    message: `${member.user.name} has been kicked from the group.`,
  };
}
