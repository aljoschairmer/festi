"use server";

import { getCurrentUser } from "@/features/auth";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";
import { type FollowUserFormData, followUserFormSchema } from "../schemas";

export async function unfollowRider(values: FollowUserFormData) {
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
      message: "You cannot unfollow yourself.",
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

  if (!alreadyFollowing) {
    return { success: false, message: "You are not following this user." };
  }

  await prisma.follow.delete({
    where: {
      followerId_followingId: {
        followerId: session.user.id,
        followingId: targetId,
      },
    },
  });

  await Logger.log(
    ActivityAction.USER_UNFOLLOWED,
    `${session.user.email} unfollowed another user.`,
    {
      actorId: session.user.id,
      targetUserId: targetId,
    },
  );

  await Notifier.remove({
    type: NotificationType.USER_FOLLOWED,
    userId: targetId,
    actorId: session.user.id,
  });

  return { success: true, message: "You are no longer following this user." };
}
