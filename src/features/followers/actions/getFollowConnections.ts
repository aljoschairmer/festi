"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";
import { isOnline } from "../lib/presence";

export type FollowUser = {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
  role: string | null;
  isOnline: boolean;
};

export type FollowConnections = {
  mutual: FollowUser[];
  following: FollowUser[];
  followers: FollowUser[];
};

const userSelect = {
  id: true,
  name: true,
  username: true,
  image: true,
  role: true,
  lastSeenAt: true,
} as const;

export async function getFollowConnections(): Promise<FollowConnections> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const myId = session.user.id;

  const [followingRows, followerRows] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: myId },
      orderBy: { createdAt: "desc" },
      select: { following: { select: userSelect } },
    }),

    prisma.follow.findMany({
      where: { followingId: myId },
      orderBy: { createdAt: "desc" },
      select: { follower: { select: userSelect } },
    }),
  ]);

  const followingUsers = followingRows.map((row) => row.following);
  const followerUsers = followerRows.map((row) => row.follower);

  const toFollowUser = ({
    lastSeenAt,
    ...user
  }: (typeof followingUsers)[number]): FollowUser => ({
    ...user,
    isOnline: isOnline(lastSeenAt),
  });

  const followingMapped = followingUsers.map(toFollowUser);
  const followerMapped = followerUsers.map(toFollowUser);

  const followingIds = new Set(followingMapped.map((user) => user.id));
  const followerIds = new Set(followerMapped.map((user) => user.id));

  const mutual = followingMapped.filter((user) => followerIds.has(user.id));

  const following = followingMapped.filter((user) => !followerIds.has(user.id));

  const followers = followerMapped.filter((user) => !followingIds.has(user.id));

  return { mutual, following, followers };
}
