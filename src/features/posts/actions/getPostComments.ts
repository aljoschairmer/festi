"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";
import type { PostComment } from "../types";

/** Hard cap so one query cannot pull an unbounded table into memory. */
const MAX_COMMENTS = 200;

/** Returns comments for a post, oldest first. */
export async function getPostComments(postId: string): Promise<PostComment[]> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const comments = await prisma.postComment.findMany({
    take: MAX_COMMENTS,
    where: { postId },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: { id: true, name: true, username: true, image: true },
      },
    },
  });

  return comments.map((comment) => ({
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    author: comment.user,
    isAuthor: comment.userId === session.user.id,
  }));
}
