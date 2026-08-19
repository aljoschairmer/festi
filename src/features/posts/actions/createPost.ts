"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { prisma } from "@/lib/prisma";
import { limitByUser } from "@/lib/rateLimit";
import { createPostSchema } from "../schemas";

type CreatePostResult =
  | { success: true; message: string; postId: string }
  | { success: false; error: string };

/**
 * Persists a new post (title + markdown content). Images are attached
 * afterwards via {@link uploadPostImage} once the post id is known.
 */
export async function createPost(input: unknown): Promise<CreatePostResult> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const rateLimitResult = await limitByUser("post", session.user.id, {
    limit: 30,
    windowSec: 60,
  });
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: "You're posting too quickly. Please try again in a minute.",
    };
  }

  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid post data.",
    };
  }

  const { title, content } = parsed.data;

  const post = await prisma.post.create({
    data: {
      authorId: session.user.id,
      title,
      content,
    },
  });

  revalidatePath("/dashboard");

  await Logger.log(
    ActivityAction.POST_CREATED,
    `${session.user.email} created the post "${post.title}".`,
    {
      actorId: session.user.id,
      targetType: "Post",
      targetId: post.id,
      metadata: { title: post.title },
    },
  );

  return {
    success: true,
    message: "Your post has been shared.",
    postId: post.id,
  };
}
