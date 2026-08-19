"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";
import { rideIdSchema, updateRideSchema } from "../schemas";

type UpdateRideResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Updates the editable details of a ride (no route/waypoints — those are
 * fixed after creation). Only the creator may edit, and a cancelled ride
 * stays untouched. When the start time moves, approved riders are notified.
 */
export async function updateRide(
  rideId: string,
  input: unknown,
): Promise<UpdateRideResult> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const idParsed = rideIdSchema.safeParse(rideId);
  if (!idParsed.success) {
    return { success: false, error: "Ride not found." };
  }

  const parsed = updateRideSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid ride data.",
    };
  }

  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      title: true,
      description: true,
      startTime: true,
      status: true,
      pace: true,
      difficulty: true,
      maxParticipants: true,
      creatorId: true,
    },
  });

  if (!ride) {
    return { success: false, error: "Ride not found." };
  }

  if (ride.creatorId !== session.user.id) {
    return {
      success: false,
      error: "Only the ride creator can edit this ride.",
    };
  }

  if (ride.status === "CANCELLED") {
    return { success: false, error: "This ride has been cancelled." };
  }

  const { title, description, startTime, pace, difficulty, maxParticipants } =
    parsed.data;
  const nextDescription = description ? description : null;
  const nextPace = pace ?? null;
  const nextDifficulty = difficulty ?? null;
  const nextMaxParticipants = maxParticipants ?? null;

  const changes: Record<string, { from: string | null; to: string | null }> =
    {};
  if (title !== ride.title) {
    changes.title = { from: ride.title, to: title };
  }
  if (nextDescription !== ride.description) {
    changes.description = { from: ride.description, to: nextDescription };
  }
  const startTimeChanged = startTime.getTime() !== ride.startTime.getTime();
  if (startTimeChanged) {
    changes.startTime = {
      from: ride.startTime.toISOString(),
      to: startTime.toISOString(),
    };
  }
  if (nextPace !== ride.pace) {
    changes.pace = { from: ride.pace, to: nextPace };
  }
  if (nextDifficulty !== ride.difficulty) {
    changes.difficulty = { from: ride.difficulty, to: nextDifficulty };
  }
  if (nextMaxParticipants !== ride.maxParticipants) {
    changes.maxParticipants = {
      from: ride.maxParticipants?.toString() ?? null,
      to: nextMaxParticipants?.toString() ?? null,
    };
  }

  await prisma.ride.update({
    where: { id: rideId },
    data: {
      title,
      description: nextDescription,
      startTime,
      pace: nextPace,
      difficulty: nextDifficulty,
      maxParticipants: nextMaxParticipants,
    },
  });

  revalidatePath("/dashboard/community-rides");
  revalidatePath(`/dashboard/community-rides/${rideId}`);

  await Logger.log(
    ActivityAction.RIDE_UPDATED,
    `${session.user.email} updated the ride "${title}".`,
    {
      actorId: session.user.id,
      targetType: "Ride",
      targetId: rideId,
      metadata: { changedFields: changes },
    },
  );

  if (startTimeChanged) {
    const approved = await prisma.rideParticipant.findMany({
      where: { rideId, status: "APPROVED" },
      select: { userId: true },
    });

    await Promise.all(
      approved.map((participant) =>
        Notifier.push({
          type: NotificationType.RIDE_UPDATED,
          userId: participant.userId,
          actorId: session.user.id,
          targetType: "Ride",
          targetId: rideId,
          message: title,
        }),
      ),
    );
  }

  return {
    success: true,
    message: `${title} has been updated.`,
  };
}
