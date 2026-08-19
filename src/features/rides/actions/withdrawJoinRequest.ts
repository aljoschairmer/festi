"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";
import { rideIdSchema } from "../schemas";

type WithdrawJoinResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Withdraws the current user's pending join request and removes the unseen
 * notification it created for the ride creator.
 */
export async function withdrawJoinRequest(
  rideId: string,
): Promise<WithdrawJoinResult> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const idParsed = rideIdSchema.safeParse(rideId);
  if (!idParsed.success) {
    return { success: false, error: "Ride not found." };
  }

  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: { id: true, title: true, creatorId: true },
  });

  if (!ride) {
    return { success: false, error: "Ride not found." };
  }

  const participation = await prisma.rideParticipant.findUnique({
    where: { rideId_userId: { rideId, userId: session.user.id } },
    select: { status: true },
  });

  if (
    participation?.status !== "PENDING" &&
    participation?.status !== "WAITLISTED"
  ) {
    return {
      success: false,
      error: "You have no pending request for this ride.",
    };
  }

  await prisma.rideParticipant.delete({
    where: { rideId_userId: { rideId, userId: session.user.id } },
  });

  revalidatePath("/dashboard/community-rides");
  revalidatePath(`/dashboard/community-rides/${rideId}`);

  await Logger.log(
    ActivityAction.RIDE_JOIN_WITHDRAWN,
    `${session.user.email} withdrew a ride join request.`,
    {
      actorId: session.user.id,
      targetUserId: ride.creatorId,
      targetType: "Ride",
      targetId: rideId,
    },
  );

  await Notifier.remove({
    type: NotificationType.RIDE_JOIN_REQUEST,
    userId: ride.creatorId,
    actorId: session.user.id,
    targetType: "Ride",
    targetId: rideId,
  });

  return {
    success: true,
    message: "Your request has been withdrawn.",
  };
}
