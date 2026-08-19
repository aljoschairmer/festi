"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { prisma } from "@/lib/prisma";
import { groupPath } from "../lib/routes";

const updateGroupMemberRoleSchema = z.object({
  groupId: z.string().min(1),
  memberId: z.string().min(1),
  role: z.enum(["member", "moderator"]),
});

type Result =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Promotes a member to moderator or demotes them back. Owner-only; the
 * owner's own role can never be changed.
 */
export async function updateGroupMemberRole(input: {
  groupId: string;
  memberId: string;
  role: "member" | "moderator";
}): Promise<Result> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const parsed = updateGroupMemberRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid input." };
  }

  const { groupId, memberId, role } = parsed.data;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { createdById: true, name: true },
  });

  if (!group) {
    return { success: false, error: "Group not found." };
  }

  if (group.createdById !== session.user.id) {
    return {
      success: false,
      error: "Only the group owner can change roles.",
    };
  }

  const member = await prisma.groupMember.findFirst({
    where: { id: memberId, groupId, status: "APPROVED" },
    select: { userId: true, role: true, user: { select: { name: true } } },
  });

  if (!member) {
    return { success: false, error: "Member not found." };
  }

  if (member.userId === group.createdById) {
    return { success: false, error: "The owner's role cannot be changed." };
  }

  if (member.role === role) {
    return { success: false, error: `Already a ${role}.` };
  }

  await prisma.groupMember.update({
    where: { id: memberId },
    data: { role },
  });

  revalidatePath(groupPath(groupId));

  await Logger.log(
    ActivityAction.GROUP_MEMBER_ROLE_CHANGED,
    `${session.user.email} made ${member.user.name} a ${role}.`,
    {
      actorId: session.user.id,
      targetUserId: member.userId,
      targetType: "Group",
      targetId: groupId,
      metadata: { from: member.role, to: role },
    },
  );

  return {
    success: true,
    message:
      role === "moderator"
        ? `${member.user.name} is now a moderator.`
        : `${member.user.name} is now a regular member.`,
  };
}
