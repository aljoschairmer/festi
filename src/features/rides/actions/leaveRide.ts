"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";
import { rideIdSchema } from "../schemas";

type LeaveRideResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Removes the current user from a ride they were approved for. The creator
 * cannot leave their own ride (they can cancel or delete it instead).
 */
export async function leaveRide(rideId: string): Promise<LeaveRideResult> {
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

  if (ride.creatorId === session.user.id) {
    return {
      success: false,
      error: "The creator cannot leave their own ride.",
    };
  }

  const participation = await prisma.rideParticipant.findUnique({
    where: { rideId_userId: { rideId, userId: session.user.id } },
    select: { status: true },
  });

  if (participation?.status !== "APPROVED") {
    return { success: false, error: "You are not part of this ride." };
  }

  const nextInLine = await prisma.$transaction(async (tx) => {
    await tx.rideParticipant.delete({
      where: { rideId_userId: { rideId, userId: session.user.id } },
    });

    const candidate = await tx.rideParticipant.findFirst({
      where: { rideId, status: "WAITLISTED" },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true },
    });
    if (!candidate) return null;

    const promoted = await tx.rideParticipant.updateMany({
      where: { id: candidate.id, status: "WAITLISTED" },
      data: { status: "PENDING" },
    });
    return promoted.count === 1 ? candidate : null;
  });

  if (nextInLine) {
    await Notifier.push({
      type: NotificationType.RIDE_WAITLIST_PROMOTED,
      userId: nextInLine.userId,
      targetType: "Ride",
      targetId: rideId,
      message: ride.title,
    });

    await Notifier.push({
      type: NotificationType.RIDE_JOIN_REQUEST,
      userId: ride.creatorId,
      actorId: nextInLine.userId,
      targetType: "Ride",
      targetId: rideId,
      message: ride.title,
    });

    await Logger.log(
      ActivityAction.RIDE_WAITLIST_PROMOTED,
      `A rider was moved off the waitlist for "${ride.title}".`,
      {
        actorId: nextInLine.userId,
        targetUserId: nextInLine.userId,
        targetType: "Ride",
        targetId: rideId,
      },
    );
  }

  revalidatePath("/dashboard/community-rides");
  revalidatePath(`/dashboard/community-rides/${rideId}`);

  await Logger.log(
    ActivityAction.RIDE_LEFT,
    `${session.user.email} left the ride "${ride.title}".`,
    {
      actorId: session.user.id,
      targetUserId: ride.creatorId,
      targetType: "Ride",
      targetId: rideId,
    },
  );

  return {
    success: true,
    message: `You left ${ride.title}.`,
  };
}
