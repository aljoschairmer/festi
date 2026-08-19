import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Restricts a ride query to what `userId` may see: ungrouped rides, their
 * own, and groups they are an approved member of. Combine via `AND`, never
 * by spreading — the search and cursor filters use `OR` too.
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
