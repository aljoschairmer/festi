"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { prisma } from "@/lib/prisma";
import { type GroupFormData, groupFormSchema } from "../schemas";

export async function createGroup(input: GroupFormData) {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false as const, error: "You must be signed in." };
  }

  // Runtime validation: types are erased at runtime and this is a public
  // endpoint, so we never trust the client-provided input.
  const parsed = groupFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid group data.",
    };
  }

  const { name, description, needApproval } = parsed.data;

  const group = await prisma.group.create({
    data: {
      name,
      description,
      needApproval,
      createdById: session.user.id,
      members: {
        create: {
          userId: session.user.id,
          role: "owner",
        },
      },
    },
  });

  revalidatePath("/dashboard/community");

  await Logger.log(
    ActivityAction.GROUP_CREATED,
    `${session.user.email} created the group "${group.name}".`,
    {
      actorId: session.user.id,
      targetType: "Group",
      targetId: group.id,
      metadata: { name: group.name, needApproval },
    },
  );

  return {
    success: true as const,
    message: `${group.name} has been created.`,
    groupId: group.id,
  };
}
