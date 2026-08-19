"use server";

import polyline from "@mapbox/polyline";
import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";
import { buildGpx, type GpxPoint, gpxFilename } from "../lib/gpx";

type Result =
  | { success: true; filename: string; gpx: string }
  | { success: false; error: string };

/**
 * Returns the ride route as a GPX document. Only the ride creator and approved
 * participants may download it.
 */
export async function getRideGpx(rideId: string): Promise<Result> {
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
      routeGeometry: true,
      elevationProfile: true,
      startTime: true,
      participants: {
        where: { userId: session.user.id },
        select: { status: true },
      },
    },
  });

  if (!ride) {
    return { success: false, error: "Ride not found." };
  }

  const isCreator = ride.creatorId === session.user.id;
  const isApproved = ride.participants[0]?.status === "APPROVED";

  if (!isCreator && !isApproved) {
    return {
      success: false,
      error: "Only riders on this route can download the GPX.",
    };
  }

  const profile = ride.elevationProfile as
    | { lat: number; lng: number; elevation: number }[]
    | null;

  const points: GpxPoint[] =
    profile && profile.length >= 2
      ? profile.map((p) => ({ lat: p.lat, lng: p.lng, ele: p.elevation }))
      : polyline.decode(ride.routeGeometry).map(([lat, lng]) => ({ lat, lng }));

  if (points.length < 2) {
    return { success: false, error: "This ride has no route to export." };
  }

  return {
    success: true,
    filename: gpxFilename(ride.title),
    gpx: buildGpx(ride.title, points, ride.startTime),
  };
}
