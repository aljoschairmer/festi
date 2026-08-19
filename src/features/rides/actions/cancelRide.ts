"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";
import { rideIdSchema } from "../schemas";

type CancelRideResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Cancels a ride without deleting it. Only the creator may cancel; everyone
 * with a pending, approved, or waitlisted spot is notified.
 *
 * When `cancelFutureSeries` is true and the ride belongs to a weekly series,
 * all future scheduled instances of the series are cancelled as well (past
 * instances are left untouched).
 */
export async function cancelRide(
  rideId: string,
  cancelFutureSeries = false,
): Promise<CancelRideResult> {
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
    select: {
      id: true,
      title: true,
      creatorId: true,
      status: true,
      recurrenceId: true,
    },
  });

  if (!ride) {
    return { success: false, error: "Ride not found." };
  }

  if (ride.creatorId !== session.user.id) {
    return {
      success: false,
      error: "Only the ride creator can cancel this ride.",
    };
  }

  if (ride.status === "CANCELLED") {
    return { success: false, error: "This ride is already cancelled." };
  }

  let rideIds = [ride.id];
  if (cancelFutureSeries && ride.recurrenceId) {
    const futureInstances = await prisma.ride.findMany({
      where: {
        recurrenceId: ride.recurrenceId,
        status: "SCHEDULED",
        startTime: { gte: new Date() },
      },
      select: { id: true },
    });
    rideIds = [...new Set([ride.id, ...futureInstances.map((r) => r.id)])];
  }

  await prisma.ride.updateMany({
    where: { id: { in: rideIds } },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/dashboard/community-rides");

  for (const id of rideIds) {
    revalidatePath(`/dashboard/community-rides/${id}`);

    await Logger.log(
      ActivityAction.RIDE_CANCELLED,
      `${session.user.email} cancelled the ride "${ride.title}".`,
      {
        actorId: session.user.id,
        targetType: "Ride",
        targetId: id,
        metadata: {
          title: ride.title,
          recurrenceId: ride.recurrenceId,
          seriesCancel: rideIds.length > 1,
        },
      },
    );

    const participants = await prisma.rideParticipant.findMany({
      where: {
        rideId: id,
        status: { in: ["PENDING", "APPROVED", "WAITLISTED"] },
      },
      select: { userId: true },
    });

    await Promise.all(
      participants.map((participant) =>
        Notifier.push({
          type: NotificationType.RIDE_CANCELLED,
          userId: participant.userId,
          actorId: session.user.id,
          targetType: "Ride",
          targetId: id,
          message: ride.title,
        }),
      ),
    );
  }

  return {
    success: true,
    message:
      rideIds.length > 1
        ? `${ride.title} and ${rideIds.length - 1} future rides in the series have been cancelled.`
        : `${ride.title} has been cancelled.`,
  };
}
