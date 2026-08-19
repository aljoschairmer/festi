"use client";

import { useQuery } from "@tanstack/react-query";
import { MessageSquare, SearchIcon, UserCheck, UserIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { DirectChatDialog } from "@/features/chat/components/directChatDialog";
import {
  type FollowConnections,
  type FollowUser,
  getFollowConnections,
} from "../actions/getFollowConnections";

function FollowerRow({
  user,
  showStatus,
}: {
  user: FollowUser;
  showStatus: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-muted/50">
      <div className="relative shrink-0">
        <Avatar className="size-10">
          <AvatarImage src={user.image ?? undefined} alt={user.name} />
          <AvatarFallback>{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        {showStatus && user.isOnline ? (
          <span
            className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-green-500"
            role="img"
            aria-label="Online"
            title="Online"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          @{user.username ?? "rider"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {showStatus ? (
          <DirectChatDialog
            initialPartner={{
              id: user.id,
              name: user.name,
              username: user.username,
              image: user.image,
            }}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Message ${user.name}`}
              >
                <MessageSquare className="size-4" />
              </Button>
            }
          />
        ) : null}
        <Button
          asChild
          variant="outline"
          size="icon"
          aria-label={`Go to ${user.name}'s profile`}
        >
          <SheetClose asChild>
            <Link href={`/dashboard/community/u/${user.id}`}>
              <UserIcon className="size-4" />
            </Link>
          </SheetClose>
        </Button>
      </div>
    </div>
  );
}

function FollowerSection({
  title,
  users,
  showStatus = false,
}: {
  title: string;
  users: FollowUser[];
  showStatus?: boolean;
}) {
  if (users.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <span className="text-xs text-muted-foreground">{users.length}</span>
      </div>
      <div className="space-y-1">
        {users.map((user) => (
          <FollowerRow key={user.id} user={user} showStatus={showStatus} />
        ))}
      </div>
    </div>
  );
}

function matchesSearch(user: FollowUser, query: string) {
  return [user.name, user.username].some((value) =>
    value?.toLowerCase().includes(query),
  );
}

const FollowerListSheet = () => {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  // `getFollowConnections` returns the *complete* follower, following and
  // mutual lists with no `take`. Polling that every 30 seconds from a sheet
  // nobody opened was the single most expensive idle request in the app, so
  // it now runs only while the sheet is on screen. Follow and unfollow
  // invalidate the key, so what is on screen still stays current.
  const { data, isLoading, isError } = useQuery<FollowConnections>({
    queryKey: ["follow-connections"],
    queryFn: () => getFollowConnections(),
    enabled: open,
  });

  const filtered = useMemo<FollowConnections>(() => {
    const empty: FollowConnections = {
      mutual: [],
      following: [],
      followers: [],
    };
    if (!data) return empty;

    const query = search.toLowerCase().trim();
    if (!query) return data;

    return {
      mutual: data.mutual.filter((user) => matchesSearch(user, query)),
      following: data.following.filter((user) => matchesSearch(user, query)),
      followers: data.followers.filter((user) => matchesSearch(user, query)),
    };
  }, [data, search]);

  const hasResults =
    filtered.mutual.length > 0 ||
    filtered.following.length > 0 ||
    filtered.followers.length > 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Your network"
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className:
            "gap-2 text-muted-foreground hover:bg-red-500/10 hover:text-foreground",
        })}
      >
        <UserCheck className="size-4 text-red-500" />
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b">
          <SheetTitle>Your network</SheetTitle>
          <SheetDescription>
            People you follow and who follow you.
          </SheetDescription>
        </SheetHeader>

        <div className="border-b p-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <p className="p-4 text-center text-sm text-red-500">
              Failed to load your network.
            </p>
          ) : !hasResults ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserIcon className="mb-4 size-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                {search ? "No matches found" : "No connections yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {search
                  ? "Try a different name or username."
                  : "Follow some riders to see them here."}
              </p>
            </div>
          ) : (
            <>
              <FollowerSection
                title="Mutual"
                users={filtered.mutual}
                showStatus
              />
              <FollowerSection title="Following" users={filtered.following} />
              <FollowerSection title="Followers" users={filtered.followers} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default FollowerListSheet;
