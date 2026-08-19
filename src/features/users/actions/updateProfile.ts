"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { riderPath } from "@/features/community/lib/routes";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { prisma } from "@/lib/prisma";
import { updateProfileSchema } from "../schemas";

type Result =
  | { success: true; message: string }
  | { success: false; error: string };

/** Updates the current user's biking profile information. */
export async function updateProfile(input: unknown): Promise<Result> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid profile data.",
    };
  }

  const data = parsed.data;

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      bio: data.bio,
      location: data.location,
      bikeBrand: data.bikeBrand,
      bikeModel: data.bikeModel,
      skillLevel: data.skillLevel,
      ridingStyles: data.ridingStyles,
      yearsRiding: data.yearsRiding ?? null,
    },
  });

  revalidatePath(riderPath(session.user.id));
  revalidatePath("/dashboard/profile");

  await Logger.log(
    ActivityAction.USER_UPDATED_PROFILE,
    `${session.user.email} updated their rider profile.`,
    { actorId: session.user.id },
  );

  return { success: true, message: "Profile updated." };
}
