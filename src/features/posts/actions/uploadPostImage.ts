"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { validateImageUpload } from "@/lib/image";
import { prisma } from "@/lib/prisma";
import { publicUrl, putObject } from "@/lib/r2";
import { limitByUser } from "@/lib/rateLimit";
import { MAX_POST_IMAGES } from "../schemas";

type Result =
  | { success: true; imageUrl: string }
  | { success: false; error: string };

/**
 * Uploads a single post image to R2 (`posts/{postId}/{position}.webp`) and
 * records it on the post. Only the author may attach images, up to
 * {@link MAX_POST_IMAGES}.
 */
export async function uploadPostImage(
  postId: string,
  position: number,
  formData: FormData,
): Promise<Result> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const rateLimitResult = await limitByUser("upload", session.user.id, {
    limit: 20,
    windowSec: 60,
  });
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: "Too many uploads. Please try again in a minute.",
    };
  }

  if (!postId) {
    return { success: false, error: "Missing post." };
  }

  if (position < 0 || position >= MAX_POST_IMAGES) {
    return { success: false, error: "Invalid image position." };
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true },
  });

  if (!post) {
    return { success: false, error: "Post not found." };
  }

  if (post.authorId !== session.user.id) {
    return { success: false, error: "You can only add images to your posts." };
  }

  const validation = await validateImageUpload(formData.get("image"));
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const key = `posts/${postId}/${position}.webp`;

  try {
    await putObject(key, validation.bytes, validation.contentType);
  } catch (error) {
    console.error("[uploadPostImage] R2 upload failed:", error);
    return { success: false, error: "Failed to upload image. Try again." };
  }

  const imageUrl = `${publicUrl(key)}?v=${Date.now()}`;

  await prisma.postImage.create({
    data: {
      postId,
      url: imageUrl,
      position,
    },
  });

  revalidatePath("/dashboard");

  return { success: true, imageUrl };
}
