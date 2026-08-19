"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";
import { fetchRoute } from "../lib/brouter";
import type { ElevationPoint, RideDetail, Waypoint } from "../types";

/**
 * Returns a single ride with its participants. The creator sees every
 * participant (including pending requests); other users see only approved
 * riders plus their own request.
 */
export async function getRide(rideId: string): Promise<RideDetail | null> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: {
      creator: {
        select: { id: true, name: true, username: true, image: true },
      },
      participants: {
        orderBy: { createdAt: "asc" },
        include: {
          user: {
            select: { id: true, name: true, username: true, image: true },
          },
        },
      },
      photos: {
        orderBy: { position: "asc" },
        select: { id: true, url: true, position: true },
      },
      group: {
        select: { id: true, name: true },
      },
    },
  });

  if (!ride) {
    return null;
  }

  const isCreator = ride.creatorId === session.user.id;

  // Group rides are members-only (same semantics as getGroupRides): without
  // this check any signed-in user could read another group's ride — including
  // participant identities and route geometry — by guessing the id.
  if (ride.groupId && !isCreator) {
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: ride.groupId,
        userId: session.user.id,
        status: "APPROVED",
      },
      select: { id: true },
    });
    if (!membership) {
      return null;
    }
  }

  const visibleParticipants = ride.participants.filter(
    (participant) =>
      isCreator ||
      participant.status === "APPROVED" ||
      participant.userId === session.user.id,
  );

  const ownParticipation = ride.participants.find(
    (participant) => participant.userId === session.user.id,
  );

  const waypoints = ride.waypoints as unknown as Waypoint[];

  // Prefer the profile stored at creation (positions match the saved route).
  // Fall back to recomputing from waypoints for older rides that lack it.
  let elevationProfile: ElevationPoint[] = [];
  const stored = ride.elevationProfile as unknown as ElevationPoint[] | null;
  if (Array.isArray(stored) && stored.length >= 2) {
    elevationProfile = stored;
  } else {
    try {
      if (waypoints.length >= 2) {
        const route = await fetchRoute(waypoints, "trekking");
        elevationProfile = route.elevationProfile;
      }
    } catch {
      elevationProfile = [];
    }
  }

  return {
    id: ride.id,
    title: ride.title,
    description: ride.description,
    startLocation: ride.startLocation,
    startTime: ride.startTime.toISOString(),
    distance: ride.distance,
    duration: ride.duration,
    elevationGain: ride.elevationGain,
    elevationLoss: ride.elevationLoss,
    routeGeometry: ride.routeGeometry,
    waypoints,
    status: ride.status,
    pace: (ride.pace ?? null) as RideDetail["pace"],
    difficulty: (ride.difficulty ?? null) as RideDetail["difficulty"],
    maxParticipants: ride.maxParticipants,
    recurrenceId: ride.recurrenceId,
    isPublic: ride.isPublic,
    createdAt: ride.createdAt.toISOString(),
    creator: ride.creator,
    participantCount: ride.participants.filter((p) => p.status === "APPROVED")
      .length,
    isCreator,
    participantStatus: ownParticipation?.status ?? null,
    photoCount: ride.photos.length,
    photos: ride.photos,
    elevationProfile,
    group: ride.group,
    participants: visibleParticipants.map((participant) => ({
      id: participant.id,
      status: participant.status,
      attended: participant.attended,
      createdAt: participant.createdAt.toISOString(),
      user: participant.user,
    })),
  };
}
