"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/guards";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { NotificationType, Notifier } from "@/features/notification";
import { prisma } from "@/lib/prisma";
import { fetchRoute } from "../lib/brouter";
import { reverseGeocode } from "../lib/geocode";
import { getGenerationJobResult, toRouteResult } from "../lib/routeEngine";
import { createRideRefinedSchema } from "../schemas";

type CreateRideResult =
  | { success: true; message: string; rideId: string }
  | { success: false; error: string };

/**
 * Persists a new ride. The route is recomputed on the server from the raw
 * waypoints so the stored distance/duration/elevation cannot be tampered with
 * by the client.
 */
export async function createRide(input: unknown): Promise<CreateRideResult> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const parsed = createRideRefinedSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid ride data.",
    };
  }

  const {
    title,
    description,
    startTime,
    startLocation,
    waypoints,
    profile,
    pace,
    difficulty,
    maxParticipants,
    groupId,
    repeatWeekly,
    generation,
  } = parsed.data;

  if (groupId) {
    const membership = await prisma.groupMember.findFirst({
      where: { groupId, userId: session.user.id, status: "APPROVED" },
      select: { id: true },
    });
    if (!membership) {
      return {
        success: false,
        error: "You must be a member of that group to post a ride to it.",
      };
    }
  }

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const instanceDates = Array.from(
    { length: repeatWeekly },
    (_, i) => new Date(startTime.getTime() + i * WEEK_MS),
  );
  const firstDay = new Date(instanceDates[0]);
  firstDay.setHours(0, 0, 0, 0);
  const lastDay = new Date(instanceDates[instanceDates.length - 1]);
  lastDay.setHours(23, 59, 59, 999);

  const conflicting = await prisma.ride.findMany({
    where: {
      creatorId: session.user.id,
      startTime: { gte: firstDay, lte: lastDay },
    },
    select: { startTime: true },
  });

  if (conflicting.length > 0) {
    const takenDays = new Set(
      conflicting.map((ride) => ride.startTime.toDateString()),
    );
    const clash = instanceDates.find((date) =>
      takenDays.has(date.toDateString()),
    );
    if (clash) {
      return {
        success: false,
        error: `You already have a ride planned for ${clash.toLocaleDateString(
          "en",
          { dateStyle: "medium" },
        )}.`,
      };
    }
  }

  let route: Awaited<ReturnType<typeof fetchRoute>>;
  try {
    if (generation) {
      const engineResult = await getGenerationJobResult(generation.jobId);
      if (engineResult.status === "expired") {
        return {
          success: false,
          error: "The generated route has expired. Please generate it again.",
        };
      }
      if (engineResult.status === "running") {
        return {
          success: false,
          error:
            "The route generation is still running. Please try again in a moment.",
        };
      }
      const engineRoute = engineResult.routes[generation.routeIndex];
      if (!engineRoute) {
        return {
          success: false,
          error:
            "The generated route could not be found. Please generate it again.",
        };
      }
      route = toRouteResult(engineRoute);
    } else {
      route = await fetchRoute(waypoints, profile);
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not calculate the route.",
    };
  }

  const start = waypoints[0];
  const resolvedStartLocation =
    (await reverseGeocode(start.lat, start.lng)) ??
    (startLocation ? startLocation : null);

  const recurrenceId = repeatWeekly > 1 ? crypto.randomUUID() : null;

  const rides = await prisma.$transaction(
    instanceDates.map((date) =>
      prisma.ride.create({
        data: {
          creatorId: session.user.id,
          title,
          description: description ? description : null,
          startLocation: resolvedStartLocation,
          startTime: date,
          distance: route.distance,
          duration: route.duration,
          elevationGain: route.elevationGain,
          elevationLoss: route.elevationLoss,
          routeGeometry: route.routeGeometry,
          waypoints,
          elevationProfile: route.elevationProfile as unknown as object,
          pace: pace ?? null,
          difficulty: difficulty ?? null,
          maxParticipants: maxParticipants ?? null,
          groupId: groupId ?? null,
          recurrenceId,
          startLat: start.lat,
          startLng: start.lng,
        },
      }),
    ),
  );
  const ride = rides[0];

  revalidatePath("/dashboard/community-rides");

  for (const [index, instance] of rides.entries()) {
    await Logger.log(
      ActivityAction.RIDE_CREATED,
      `${session.user.email} created the ride "${instance.title}".`,
      {
        actorId: session.user.id,
        targetType: "Ride",
        targetId: instance.id,
        metadata: {
          title: instance.title,
          distance: instance.distance,
          elevationGain: instance.elevationGain,
          groupId: instance.groupId,
          recurrenceId,
          seriesIndex: index + 1,
          seriesLength: rides.length,
        },
      },
    );
  }

  if (ride.groupId) {
    const members = await prisma.groupMember.findMany({
      where: {
        groupId: ride.groupId,
        status: "APPROVED",
        NOT: { userId: session.user.id },
      },
      select: { userId: true },
    });

    await Promise.all(
      members.map((member) =>
        Notifier.push({
          type: NotificationType.GROUP_RIDE_CREATED,
          userId: member.userId,
          actorId: session.user.id,
          targetType: "Ride",
          targetId: ride.id,
          message:
            rides.length > 1 ? `${ride.title} (weekly series)` : ride.title,
        }),
      ),
    );
  }

  return {
    success: true,
    message:
      rides.length > 1
        ? `${ride.title} has been created as a weekly series (${rides.length} rides).`
        : `${ride.title} has been created.`,
    rideId: ride.id,
  };
}
