"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { validateImageUpload } from "@/lib/image";
import { prisma } from "@/lib/prisma";
import { publicUrl, putObject } from "@/lib/r2";
import { limitByUser } from "@/lib/rateLimit";

type Result =
  | { success: true; message: string; imageUrl: string }
  | { success: false; error: string };

/**
 * Uploads the current user's avatar to R2 and stores the reference on
 * `User.image`. The object key is stable (`users/{id}/avatar.webp`) so a new
 * upload overwrites the old one in place — no orphaned files.
 */
export async function uploadAvatar(formData: FormData): Promise<Result> {
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

  const validation = await validateImageUpload(formData.get("image"));
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const userId = session.user.id;
  const key = `users/${userId}/avatar.webp`;

  try {
    await putObject(key, validation.bytes, validation.contentType);
  } catch (error) {
    console.error("[uploadAvatar] R2 upload failed:", error);
    return { success: false, error: "Failed to upload image. Try again." };
  }

  const imageUrl = `${publicUrl(key)}?v=${Date.now()}`;

  await prisma.user.update({
    where: { id: userId },
    data: { image: imageUrl },
  });

  revalidatePath("/dashboard/profile");

  await Logger.log(
    ActivityAction.USER_UPDATED_PROFILE,
    `${session.user.email} updated their profile picture.`,
    { actorId: userId, targetUserId: userId, targetType: "User" },
  );

  return {
    success: true,
    message: "Profile picture updated.",
    imageUrl,
  };
}
