"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { validateImageUpload } from "@/lib/image";
import { prisma } from "@/lib/prisma";
import { publicUrl, putObject } from "@/lib/r2";
import { checkRateLimit } from "@/lib/rateLimit";

type Result =
  | { success: true; message: string; imageUrl: string }
  | { success: false; error: string };

/**
 * Uploads a group cover image to R2 (`groups/{id}/cover.webp`) and stores the
 * reference on `Group.image`. Only the group owner may set the image.
 */
export async function uploadGroupImage(
  groupId: string,
  formData: FormData,
): Promise<Result> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const rateLimitResult = await checkRateLimit(
    `upload:${session.user.id}`,
    20,
    60,
  );
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: "Too many uploads. Please try again in a minute.",
    };
  }

  if (!groupId) {
    return { success: false, error: "Missing group." };
  }

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, createdById: true, name: true },
  });

  if (!group) {
    return { success: false, error: "Group not found." };
  }

  if (group.createdById !== session.user.id) {
    return {
      success: false,
      error: "Only the group owner can change the image.",
    };
  }

  const validation = await validateImageUpload(formData.get("image"));
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const key = `groups/${groupId}/cover.webp`;

  try {
    await putObject(key, validation.bytes, validation.contentType);
  } catch (error) {
    console.error("[uploadGroupImage] R2 upload failed:", error);
    return { success: false, error: "Failed to upload image. Try again." };
  }

  const imageUrl = `${publicUrl(key)}?v=${Date.now()}`;

  await prisma.group.update({
    where: { id: groupId },
    data: { image: imageUrl },
  });

  revalidatePath("/dashboard/community");
  revalidatePath(`/dashboard/community/g/${groupId}`);

  await Logger.log(
    ActivityAction.GROUP_UPDATED,
    `${session.user.email} updated the image for "${group.name}".`,
    {
      actorId: session.user.id,
      targetType: "Group",
      targetId: groupId,
    },
  );

  return {
    success: true,
    message: "Group image updated.",
    imageUrl,
  };
}
