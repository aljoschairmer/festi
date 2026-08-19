import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Rides posted to a group are meant for that group only — `getGroupRides`
 * says so in its docstring, but the generic lists (`getRides`, `getRide`,
 * `getFeed`) and `requestJoinRide` used to ignore `groupId` entirely, so a
 * group ride showed up for every signed-in user.
 *
 * Everything here answers one question: which rides may this user see?
 * Ungrouped rides are public to signed-in users; grouped rides need an
 * approved membership (the creator always keeps access to their own ride).
 */

/** Group ids the user is an approved member of. */
export async function approvedGroupIds(userId: string): Promise<string[]> {
  const memberships = await prisma.groupMember.findMany({
    where: { userId, status: "APPROVED" },
    select: { groupId: true },
  });
  return memberships.map((m) => m.groupId);
}

/**
 * `where` fragment restricting a ride query to what `userId` may see.
 * Combine with the caller's own filters via `AND`.
 */
export function rideVisibilityFilter(
  userId: string,
  groupIds: string[],
): Prisma.RideWhereInput {
  return {
    OR: [
      { groupId: null },
      { creatorId: userId },
      ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
    ],
  };
}

/** Convenience: load the memberships and build the filter in one step. */
export async function visibleRidesFilter(
  userId: string,
): Promise<Prisma.RideWhereInput> {
  return rideVisibilityFilter(userId, await approvedGroupIds(userId));
}

/** Whether a single ride is readable by `userId`. */
export async function canViewRide(
  userId: string,
  ride: { groupId: string | null; creatorId: string },
): Promise<boolean> {
  if (ride.groupId === null || ride.creatorId === userId) return true;
  const membership = await prisma.groupMember.findFirst({
    where: { groupId: ride.groupId, userId, status: "APPROVED" },
    select: { id: true },
  });
  return membership !== null;
}
