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

/**
 * `where` fragment restricting a ride query to what `userId` may see.
 * Combine with the caller's own filters via `AND`, never by spreading — the
 * search and cursor filters use `OR` too, and a spread silently drops one.
 *
 * The membership test is a relation filter rather than a pre-fetched list of
 * group ids: it costs no extra round trip, it cannot go stale between the
 * two queries, and it stays one indexed `EXISTS` instead of an `IN` list
 * that grows with every group the user joins.
 */
export function rideVisibilityFilter(userId: string): Prisma.RideWhereInput {
  return {
    OR: [
      { groupId: null },
      { creatorId: userId },
      { group: { members: { some: { userId, status: "APPROVED" } } } },
    ],
  };
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
