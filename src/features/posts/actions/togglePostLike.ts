"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/prismaErrors";

type Result =
  | { success: true; liked: boolean; likeCount: number }
  | { success: false; error: string };

/** Toggles the current user's like on a post. */
export async function togglePostLike(postId: string): Promise<Result> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  if (!postId) {
    return { success: false, error: "Missing post." };
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, title: true, authorId: true },
  });
  if (!post) {
    return { success: false, error: "Post not found." };
  }

  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId, userId: session.user.id } },
    select: { id: true },
  });

  let liked: boolean;
  if (existing) {
    await prisma.postLike.delete({ where: { id: existing.id } });
    liked = false;
    // Undo the unseen like notification so the author isn't spammed.
    await Notifier.remove({
      type: NotificationType.POST_LIKED,
      userId: post.authorId,
      actorId: session.user.id,
      targetType: "Post",
      targetId: post.id,
    });
  } else {
    try {
      await prisma.postLike.create({
        data: { postId, userId: session.user.id },
      });
    } catch (error) {
      // Double-click: the row already exists. That is the state the user
      // wanted, so report success instead of leaking a raw P2002.
      if (!isUniqueViolation(error)) throw error;
      return {
        success: true,
        liked: true,
        likeCount: await prisma.postLike.count({ where: { postId } }),
      };
    }
    liked = true;

    await Logger.log(
      ActivityAction.POST_LIKED,
      `${session.user.email} liked the post "${post.title}".`,
      {
        actorId: session.user.id,
        targetUserId: post.authorId,
        targetType: "Post",
        targetId: post.id,
      },
    );

    await Notifier.push({
      type: NotificationType.POST_LIKED,
      userId: post.authorId,
      actorId: session.user.id,
      targetType: "Post",
      targetId: post.id,
      message: post.title,
    });
  }

  const likeCount = await prisma.postLike.count({ where: { postId } });

  return { success: true, liked, likeCount };
}
