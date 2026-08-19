"use server";

import { getCurrentUser } from "@/features/auth/guards";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { type RideFiltersInput, rideFiltersSchema } from "../schemas";
import type { RideSummary, Waypoint } from "../types";

/** Great-circle distance in kilometres. */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Returns scheduled rides ordered by start time, with the approved
 * participant count and the current user's join status. Cancelled rides are
 * hidden. Accepts optional discovery filters: case-insensitive search over
 * title/start location, exact pace/difficulty match, and `includePast` to
 * also return rides that already started (default: upcoming only).
 */
export async function getRides(input?: unknown): Promise<RideSummary[]> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const parsed = rideFiltersSchema.safeParse(input ?? {});
  const filters: RideFiltersInput = parsed.success ? parsed.data : {};

  // Proximity filter: cheap bounding box in SQL, exact haversine below.
  // Rides without stored coordinates are excluded when a radius is set.
  const near =
    filters.nearLat !== undefined &&
    filters.nearLng !== undefined &&
    filters.radiusKm !== undefined
      ? {
          lat: filters.nearLat,
          lng: filters.nearLng,
          radiusKm: filters.radiusKm,
        }
      : null;
  const latDelta = near ? near.radiusKm / 111.32 : 0;
  const lngDelta = near
    ? near.radiusKm /
      (111.32 * Math.max(Math.cos((near.lat * Math.PI) / 180), 0.01))
    : 0;

  const where: Prisma.RideWhereInput = {
    status: "SCHEDULED",
    // Group rides are members-only (same semantics as getGroupRides):
    // discovery must not list another group's rides. Public rides
    // (groupId: null) and the user's own rides are unaffected.
    AND: [
      {
        OR: [
          { groupId: null },
          { creatorId: session.user.id },
          {
            group: {
              members: {
                some: { userId: session.user.id, status: "APPROVED" },
              },
            },
          },
        ],
      },
    ],
    ...(filters.includePast ? {} : { startTime: { gte: new Date() } }),
    ...(filters.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: "insensitive" } },
            {
              startLocation: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
    ...(filters.pace ? { pace: filters.pace } : {}),
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...(near
      ? {
          startLat: {
            gte: near.lat - latDelta,
            lte: near.lat + latDelta,
          },
          startLng: {
            gte: near.lng - lngDelta,
            lte: near.lng + lngDelta,
          },
        }
      : {}),
  };

  const rides = await prisma.ride.findMany({
    where,
    orderBy: {
      startTime: "asc",
    },
    include: {
      creator: {
        select: { id: true, name: true, username: true, image: true },
      },
      participants: {
        where: { userId: session.user.id },
        select: { status: true },
      },
      _count: {
        select: {
          participants: { where: { status: "APPROVED" } },
          photos: true,
        },
      },
    },
  });

  const filtered = near
    ? rides.filter((ride) => {
        if (ride.startLat === null || ride.startLng === null) return false;
        return (
          haversineKm(near.lat, near.lng, ride.startLat, ride.startLng) <=
          near.radiusKm
        );
      })
    : rides;

  return filtered.map((ride) => ({
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
    waypoints: ride.waypoints as unknown as Waypoint[],
    status: ride.status,
    pace: (ride.pace ?? null) as RideSummary["pace"],
    difficulty: (ride.difficulty ?? null) as RideSummary["difficulty"],
    maxParticipants: ride.maxParticipants,
    recurrenceId: ride.recurrenceId,
    createdAt: ride.createdAt.toISOString(),
    creator: ride.creator,
    participantCount: ride._count.participants,
    isCreator: ride.creatorId === session.user.id,
    participantStatus: ride.participants[0]?.status ?? null,
    photoCount: ride._count.photos,
  }));
}
