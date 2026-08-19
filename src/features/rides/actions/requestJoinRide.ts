"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";
import { canViewRide } from "../lib/visibility";

type RequestJoinResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Creates a pending join request for a ride and notifies its creator.
 */
export async function requestJoinRide(
  rideId: string,
): Promise<RequestJoinResult> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      title: true,
      creatorId: true,
      startTime: true,
      status: true,
      maxParticipants: true,
      groupId: true,
    },
  });

  if (!ride) {
    return { success: false, error: "Ride not found." };
  }

  if (!(await canViewRide(session.user.id, ride))) {
    return { success: false, error: "Ride not found." };
  }

  if (ride.status === "CANCELLED") {
    return { success: false, error: "This ride has been cancelled." };
  }

  if (ride.startTime.getTime() < Date.now()) {
    return { success: false, error: "This ride has already taken place." };
  }

  if (ride.creatorId === session.user.id) {
    return { success: false, error: "You cannot join your own ride." };
  }

  const existing = await prisma.rideParticipant.findUnique({
    where: { rideId_userId: { rideId, userId: session.user.id } },
    select: { status: true },
  });

  if (existing && existing.status === "WAITLISTED") {
    return {
      success: false,
      error: "You are already on the waitlist for this ride.",
    };
  }

  if (existing && existing.status !== "REJECTED") {
    return {
      success: false,
      error: "You have already requested to join this ride.",
    };
  }

  let isFull = false;
  if (ride.maxParticipants !== null) {
    const approvedCount = await prisma.rideParticipant.count({
      where: { rideId, status: "APPROVED" },
    });
    isFull = approvedCount >= ride.maxParticipants;
  }
  const status = isFull ? "WAITLISTED" : "PENDING";

  if (existing) {
    await prisma.rideParticipant.update({
      where: { rideId_userId: { rideId, userId: session.user.id } },
      data: { status },
    });
  } else {
    await prisma.rideParticipant.create({
      data: {
        rideId,
        userId: session.user.id,
        status,
      },
    });
  }

  revalidatePath(`/dashboard/community-rides/${rideId}`);

  await Logger.log(
    isFull
      ? ActivityAction.RIDE_WAITLISTED
      : ActivityAction.RIDE_JOIN_REQUESTED,
    isFull
      ? `${session.user.email} joined the waitlist for a ride.`
      : `${session.user.email} requested to join a ride.`,
    {
      actorId: session.user.id,
      targetType: "Ride",
      targetId: rideId,
    },
  );

  await Notifier.push({
    type: NotificationType.RIDE_JOIN_REQUEST,
    userId: ride.creatorId,
    actorId: session.user.id,
    targetType: "Ride",
    targetId: rideId,
    message: ride.title,
  });

  return {
    success: true,
    message: isFull
      ? "This ride is full — you are on the waitlist and will be moved up when a spot frees."
      : "Your request to join has been sent.",
  };
}
