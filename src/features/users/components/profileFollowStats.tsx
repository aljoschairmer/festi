"use client";

import { useQuery } from "@tanstack/react-query";
import { UserIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type FollowConnections,
  type FollowUser,
  getFollowConnections,
} from "@/features/followers/actions/getFollowConnections";

type ProfileFollowStatsProps = {
  followersCount: number;
  followingCount: number;
};

export function ProfileFollowStats({
  followersCount,
  followingCount,
}: ProfileFollowStatsProps) {
  const [openList, setOpenList] = useState<null | "followers" | "following">(
    null,
  );

  const { data } = useQuery<FollowConnections>({
    queryKey: ["follow-connections"],
    queryFn: () => getFollowConnections(),
    enabled: openList !== null,
  });

  const followers = data ? [...data.mutual, ...data.followers] : [];
  const following = data ? [...data.mutual, ...data.following] : [];

  const shownFollowers = data ? followers.length : followersCount;
  const shownFollowing = data ? following.length : followingCount;

  return (
    <>
      <div className="flex items-center gap-6 pt-1 text-sm">
        <button
          type="button"
          onClick={() => setOpenList("followers")}
          className="transition-colors hover:text-primary"
        >
          <span className="font-semibold text-foreground">
            {shownFollowers}
          </span>{" "}
          <span className="text-muted-foreground">
            {shownFollowers === 1 ? "follower" : "followers"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setOpenList("following")}
          className="transition-colors hover:text-primary"
        >
          <span className="font-semibold text-foreground">
            {shownFollowing}
          </span>{" "}
          <span className="text-muted-foreground">following</span>
        </button>
      </div>

      <Dialog open={openList !== null} onOpenChange={() => setOpenList(null)}>
        <DialogContent className="max-h-[70vh] overflow-hidden p-0">
          <DialogHeader className="border-b p-4">
            <DialogTitle>
              {openList === "followers" ? "Followers" : "Following"}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[55vh] space-y-1 overflow-y-auto p-3">
            <FollowUserList
              users={openList === "followers" ? followers : following}
              emptyText={
                openList === "followers"
                  ? "No followers yet."
                  : "Not following anyone yet."
              }
              onNavigate={() => setOpenList(null)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FollowUserList({
  users,
  emptyText,
  onNavigate,
}: {
  users: FollowUser[];
  emptyText: string;
  onNavigate: () => void;
}) {
  if (users.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <>
      {users.map((user) => (
        <Link
          key={user.id}
          href={`/dashboard/community/u/${user.id}`}
          prefetch={false}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-muted/50"
        >
          <Avatar className="size-10">
            <AvatarImage src={user.image ?? undefined} alt={user.name} />
            <AvatarFallback>
              {user.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              @{user.username ?? "rider"}
            </p>
          </div>
          <UserIcon className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </>
  );
}
