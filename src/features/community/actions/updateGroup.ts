"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { prisma } from "@/lib/prisma";
import { groupPath } from "../lib/routes";
import { type GroupFormData, groupFormSchema } from "../schemas";

export async function updateGroup(input: GroupFormData & { groupId: string }) {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false as const, error: "You must be signed in." };
  }

  const parsed = groupFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid group data.",
    };
  }

  const group = await prisma.group.findUnique({
    where: { id: input.groupId },
    select: {
      id: true,
      createdById: true,
    },
  });

  if (!group) {
    return { success: false as const, error: "Group not found." };
  }

  if (group.createdById !== session.user.id) {
    return {
      success: false as const,
      error: "Only the group owner can edit this group.",
    };
  }

  const updatedGroup = await prisma.group.update({
    where: { id: input.groupId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      needApproval: parsed.data.needApproval,
    },
  });

  revalidatePath(groupPath(input.groupId));

  await Logger.log(
    ActivityAction.GROUP_UPDATED,
    `${session.user.email} updated the group "${updatedGroup.name}".`,
    {
      actorId: session.user.id,
      targetType: "Group",
      targetId: updatedGroup.id,
      metadata: { name: updatedGroup.name },
    },
  );

  return {
    success: true as const,
    message: `${updatedGroup.name} has been updated.`,
  };
}
