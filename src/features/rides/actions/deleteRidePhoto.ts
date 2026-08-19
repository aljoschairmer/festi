"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";
import { deleteObject, publicUrl } from "@/lib/r2";

type Result = { success: true } | { success: false; error: string };

/** Deletes an after-ride photo. Only the ride owner may delete. */
export async function deleteRidePhoto(photoId: string): Promise<Result> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const photo = await prisma.ridePhoto.findUnique({
    where: { id: photoId },
    select: {
      id: true,
      url: true,
      rideId: true,
      ride: { select: { creatorId: true } },
    },
  });

  if (!photo) {
    return { success: false, error: "Photo not found." };
  }

  if (photo.ride.creatorId !== session.user.id) {
    return { success: false, error: "Only the ride owner can delete photos." };
  }

  const base = publicUrl("");
  const key = photo.url.replace(base, "").split("?")[0];
  if (key) {
    await deleteObject(key).catch((error) => {
      console.error("[deleteRidePhoto] R2 delete failed:", error);
    });
  }

  await prisma.ridePhoto.delete({ where: { id: photoId } });

  revalidatePath(`/dashboard/community-rides/${photo.rideId}`);

  return { success: true };
}
