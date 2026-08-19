"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";
import { deleteObject, keyFromPublicUrl } from "@/lib/r2";

type Result = { success: true } | { success: false; error: string };

/** Deletes a post the current user authored. */
export async function deletePost(postId: string): Promise<Result> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      authorId: true,
      images: { select: { url: true } },
    },
  });

  if (!post) {
    return { success: false, error: "Post not found." };
  }

  if (post.authorId !== session.user.id) {
    return { success: false, error: "You can only delete your own posts." };
  }

  await prisma.post.delete({ where: { id: postId } });

  await Promise.allSettled(
    post.images
      .map((image) => keyFromPublicUrl(image.url))
      .filter((key): key is string => key !== null)
      .map((key) => deleteObject(key)),
  );

  revalidatePath("/dashboard");

  return { success: true };
}
