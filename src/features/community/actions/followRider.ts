"use server";

import { getCurrentUser } from "@/features/auth";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/prismaErrors";
import { type FollowUserFormData, followUserFormSchema } from "../schemas";

export async function followRider(values: FollowUserFormData) {
  const validatedData = followUserFormSchema.safeParse(values);
  if (!validatedData.success) {
    return { success: false, message: "Invalid form data." };
  }

  const session = await getCurrentUser();
  if (!session) {
    return { success: false, message: "You must be signed in." };
  }

  const { targetId } = validatedData.data;

  if (session.user.id === targetId) {
    return {
      success: false,
      message: "You cannot follow yourself.",
    };
  }

  const alreadyFollowing = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: session.user.id,
        followingId: targetId,
      },
    },
  });

  if (alreadyFollowing) {
    return { success: false, message: "You are already following this user." };
  }

  try {
    await prisma.follow.create({
      data: {
        followerId: session.user.id,
        followingId: targetId,
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { success: true as const, message: "You are now following them." };
  }

  await Logger.log(
    ActivityAction.USER_FOLLOWED,
    `${session.user.email} followed another user.`,
    {
      actorId: session.user.id,
      targetUserId: targetId,
    },
  );

  await Notifier.push({
    type: NotificationType.USER_FOLLOWED,
    userId: targetId,
    actorId: session.user.id,
  });

  return { success: true, message: "You are now following this user." };
}
