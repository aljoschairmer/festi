"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { validateImageUpload } from "@/lib/image";
import { prisma } from "@/lib/prisma";
import { publicUrl, putObject } from "@/lib/r2";
import { checkRateLimit } from "@/lib/rateLimit";
import { MAX_RIDE_PHOTOS } from "../schemas";

type Result =
  | { success: true; imageUrl: string }
  | { success: false; error: string };

/**
 * Uploads an after-ride photo to R2 (`rides/{rideId}/photos/{n}.webp`). Only
 * the ride owner may add photos, only once the ride is in the past, and up to
 * {@link MAX_RIDE_PHOTOS} photos.
 */
export async function uploadRidePhoto(
  rideId: string,
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

  if (!rideId) {
    return { success: false, error: "Missing ride." };
  }

  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      creatorId: true,
      startTime: true,
      _count: { select: { photos: true } },
    },
  });

  if (!ride) {
    return { success: false, error: "Ride not found." };
  }

  if (ride.creatorId !== session.user.id) {
    return { success: false, error: "Only the ride owner can add photos." };
  }

  if (ride.startTime.getTime() >= Date.now()) {
    return {
      success: false,
      error: "You can only add photos after the ride has taken place.",
    };
  }

  if (ride._count.photos >= MAX_RIDE_PHOTOS) {
    return {
      success: false,
      error: `You can add up to ${MAX_RIDE_PHOTOS} photos.`,
    };
  }

  const validation = await validateImageUpload(formData.get("image"));
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  // Use a unique key so re-uploads never collide.
  const key = `rides/${rideId}/photos/${Date.now()}-${ride._count.photos}.webp`;

  try {
    await putObject(key, validation.bytes, validation.contentType);
  } catch (error) {
    console.error("[uploadRidePhoto] R2 upload failed:", error);
    return { success: false, error: "Failed to upload photo. Try again." };
  }

  const imageUrl = `${publicUrl(key)}?v=${Date.now()}`;

  await prisma.ridePhoto.create({
    data: {
      rideId,
      url: imageUrl,
      position: ride._count.photos,
    },
  });

  revalidatePath(`/dashboard/community-rides/${rideId}`);

  return { success: true, imageUrl };
}
