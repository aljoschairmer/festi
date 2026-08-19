"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/r2";
import { COMMUNITY_PATH } from "../lib/routes";

export async function deleteGroup(groupId: string) {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false as const, error: "You must be signed in." };
  }

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      createdById: true,
    },
  });

  if (!group) {
    return { success: false as const, error: "Group not found." };
  }

  if (group.createdById !== session.user.id) {
    return {
      success: false as const,
      error: "Only the group owner can delete this group.",
    };
  }

  await prisma.group.delete({
    where: { id: groupId },
  });

  try {
    await deleteObject(`groups/${groupId}/cover.webp`);
  } catch (error) {
    console.error("[deleteGroup] Failed to delete R2 image:", error);
  }

  revalidatePath(COMMUNITY_PATH);

  await Logger.log(
    ActivityAction.GROUP_DELETED,
    `${session.user.email} deleted the group "${group.name}".`,
    {
      actorId: session.user.id,
      targetType: "Group",
      targetId: group.id,
      metadata: { name: group.name },
    },
  );

  return {
    success: true as const,
    message: `${group.name} has been deleted.`,
  };
}
