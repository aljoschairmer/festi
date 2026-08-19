"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";

type RespondResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Approves or rejects a pending join request. Only the ride creator may
 * respond; the requesting user is notified of the decision.
 */
export async function respondToJoinRequest(
  participantId: string,
  approve: boolean,
): Promise<RespondResult> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const participant = await prisma.rideParticipant.findUnique({
    where: { id: participantId },
    include: {
      ride: {
        select: {
          id: true,
          title: true,
          creatorId: true,
          status: true,
          maxParticipants: true,
        },
      },
    },
  });

  if (!participant) {
    return { success: false, error: "Join request not found." };
  }

  if (participant.ride.creatorId !== session.user.id) {
    return {
      success: false,
      error: "Only the ride creator can respond to requests.",
    };
  }

  if (participant.ride.status === "CANCELLED") {
    return { success: false, error: "This ride has been cancelled." };
  }

  if (approve && participant.status !== "PENDING") {
    return {
      success: false,
      error: "This request has already been handled.",
    };
  }

  // Creators can also decline riders who are still on the waitlist.
  if (!approve && participant.status === "APPROVED") {
    return {
      success: false,
      error: "This request has already been handled.",
    };
  }
  if (!approve && participant.status === "REJECTED") {
    return {
      success: false,
      error: "This request has already been handled.",
    };
  }

  // Capacity is re-checked inside the transaction below; this early exit
  // only avoids the write when the ride is already visibly full.
  if (approve && participant.ride.maxParticipants !== null) {
    const approvedCount = await prisma.rideParticipant.count({
      where: { rideId: participant.ride.id, status: "APPROVED" },
    });
    if (approvedCount >= participant.ride.maxParticipants) {
      return { success: false, error: "This ride is full." };
    }
  }

  const status = approve ? "APPROVED" : "REJECTED";
  const cap = participant.ride.maxParticipants;

  // Re-check capacity inside the transaction: two approvals racing each
  // other would both pass the check above and overbook the ride.
  const overbooked = await prisma.$transaction(async (tx) => {
    if (approve && cap !== null) {
      const approvedCount = await tx.rideParticipant.count({
        where: { rideId: participant.ride.id, status: "APPROVED" },
      });
      if (approvedCount >= cap) return true;
    }
    await tx.rideParticipant.update({
      where: { id: participantId },
      data: { status },
    });
    return false;
  });

  if (overbooked) {
    return { success: false, error: "This ride is full." };
  }

  revalidatePath(`/dashboard/community-rides/${participant.ride.id}`);

  await Logger.log(
    approve
      ? ActivityAction.RIDE_JOIN_APPROVED
      : ActivityAction.RIDE_JOIN_REJECTED,
    `${session.user.email} ${approve ? "approved" : "rejected"} a ride join request.`,
    {
      actorId: session.user.id,
      targetUserId: participant.userId,
      targetType: "Ride",
      targetId: participant.ride.id,
    },
  );

  await Notifier.push({
    type: approve
      ? NotificationType.RIDE_JOIN_APPROVED
      : NotificationType.RIDE_JOIN_REJECTED,
    userId: participant.userId,
    actorId: session.user.id,
    targetType: "Ride",
    targetId: participant.ride.id,
    message: participant.ride.title,
  });

  return {
    success: true,
    message: approve ? "Rider approved." : "Request declined.",
  };
}
