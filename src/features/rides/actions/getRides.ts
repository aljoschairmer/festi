"use server";

import { getCurrentUser } from "@/features/auth/guards";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { rideVisibilityFilter } from "../lib/visibility";
import { type RideFiltersInput, rideFiltersSchema } from "../schemas";
import type { RideListPage } from "../types";

/** Default page size for the paginated rides list. */
const RIDES_PAGE_SIZE = 20;

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
 *
 * Results are cursor-paginated (`cursor` = id of the last ride of the
 * previous page, `take` = page size, default 20) and limited to the fields
 * the ride cards render, so the list stays cheap as the table grows.
 */
export async function getRides(input?: unknown): Promise<RideListPage> {
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
    // Group rides are members-only (same semantics as getGroupRides):
    // discovery must not list another group's rides. Public rides
    // (groupId: null) and the user's own rides are unaffected.
    //
    // `AND`, not a spread: the visibility rule and the search filter below
    // both use `OR`, and spreading would silently drop one of them.
    AND: [rideVisibilityFilter(session.user.id)],
    status: "SCHEDULED",
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

  const take = filters.take ?? RIDES_PAGE_SIZE;

  // Only the fields the ride cards render (routeGeometry stays for the
  // thumbnails); description/waypoints/gpx-sized fields are not selected.
  const rows = await prisma.ride.findMany({
    where,
    // id tiebreaker keeps the order stable for cursor pagination.
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: take + 1, // one extra row to detect whether another page exists
    select: {
      id: true,
      title: true,
      startLocation: true,
      startTime: true,
      distance: true,
      duration: true,
      elevationGain: true,
      routeGeometry: true,
      status: true,
      pace: true,
      difficulty: true,
      maxParticipants: true,
      creatorId: true,
      startLat: true,
      startLng: true,
      creator: {
        select: { name: true, username: true },
      },
      participants: {
        where: { userId: session.user.id },
        select: { status: true },
      },
      _count: {
        select: {
          participants: { where: { status: "APPROVED" } },
        },
      },
    },
  });

  const hasMore = rows.length > take;
  const pageRows = hasMore ? rows.slice(0, take) : rows;
  // The cursor comes from the unfiltered page so the proximity filter below
  // can never stall pagination on a page that filters down to zero rows.
  const nextCursor = hasMore
    ? (pageRows[pageRows.length - 1]?.id ?? null)
    : null;

  const filtered = near
    ? pageRows.filter((ride) => {
        if (ride.startLat === null || ride.startLng === null) return false;
        return (
          haversineKm(near.lat, near.lng, ride.startLat, ride.startLng) <=
          near.radiusKm
        );
      })
    : pageRows;

  return {
    rides: filtered.map((ride) => ({
      id: ride.id,
      title: ride.title,
      startLocation: ride.startLocation,
      startTime: ride.startTime.toISOString(),
      distance: ride.distance,
      duration: ride.duration,
      elevationGain: ride.elevationGain,
      routeGeometry: ride.routeGeometry,
      status: ride.status,
      pace: (ride.pace ?? null) as RideListPage["rides"][number]["pace"],
      difficulty: (ride.difficulty ??
        null) as RideListPage["rides"][number]["difficulty"],
      maxParticipants: ride.maxParticipants,
      creator: ride.creator,
      participantCount: ride._count.participants,
      isCreator: ride.creatorId === session.user.id,
      participantStatus: ride.participants[0]?.status ?? null,
    })),
    nextCursor,
  };
}
