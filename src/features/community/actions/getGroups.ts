"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";

/** Hard cap so one query cannot pull an unbounded table into memory. */
const DEFAULT_GROUP_LIMIT = 200;

export async function getGroups() {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const groups = await prisma.group.findMany({
    take: DEFAULT_GROUP_LIMIT,
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
      members: {
        select: {
          userId: true,
          status: true,
        },
      },
    },
  });

  return groups.map((group) => {
    const approvedMembers = group.members.filter(
      (member) => member.status === "APPROVED",
    );
    const ownMembership = group.members.find(
      (member) => member.userId === session.user.id,
    );

    return {
      id: group.id,
      name: group.name,
      image: group.image,
      createdAt: group.createdAt.toISOString(),
      memberCount: approvedMembers.length,
      createdBy: group.createdBy,
      isOwner: group.createdById === session.user.id,
      isMember: ownMembership?.status === "APPROVED",
      membershipStatus: ownMembership?.status ?? null,
      needApproval: group.needApproval,
    };
  });
}
