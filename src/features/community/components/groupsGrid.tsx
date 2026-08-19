"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, PlusIcon, SearchIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getGroups } from "../actions/getGroups";
import type { Group } from "../types";
import { GroupJoinButton } from "./groupJoinButton";

const PAGE_SIZE = 5;

export function GroupsGrid() {
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const {
    data: groups = [],
    isLoading,
    isError,
  } = useQuery<Group[]>({
    queryKey: ["groups"],
    queryFn: () => getGroups(),
  });

  const filteredGroups = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) return groups;

    return groups.filter((group) =>
      [group.name, group.createdBy.name]
        .filter(Boolean)
        .some((value) => (value ?? "").toLowerCase().includes(query)),
    );
  }, [groups, search]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on search change
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [search]);

  const shownGroups = filteredGroups.slice(0, visible);
  const hasMore = filteredGroups.length > visible;

  const loadMore = () => {
    setLoadingMore(true);
    setTimeout(() => {
      setVisible((v) => v + PAGE_SIZE);
      setLoadingMore(false);
    }, 400);
  };

  if (isLoading)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["a", "b", "c"].map((key) => (
          <Skeleton key={key} className="h-[84px] w-full rounded-xl" />
        ))}
      </div>
    );
  if (isError)
    return <p className="text-sm text-red-500">Failed to load groups.</p>;

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Label htmlFor="groups-search" className="sr-only">
          Search groups
        </Label>
        <Input
          id="groups-search"
          placeholder="Search groups..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <UsersIcon className="mb-4 size-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">No groups found</p>
          <p className="text-sm text-muted-foreground">
            Try searching for another group.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shownGroups.map((group, index) => (
            <div
              key={group.id}
              className="duration-500 animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
              style={{ animationDelay: `${(index % PAGE_SIZE) * 60}ms` }}
            >
              <Link href={`/dashboard/community/g/${group.id}`}>
                <Card className="h-full transition hover:border-red-500/40 hover:bg-muted/40">
                  <CardContent className="flex items-center gap-4 p-4">
                    <Avatar className="size-12">
                      <AvatarImage src={group.image ?? undefined} sizes="" />
                      <AvatarFallback>
                        <UsersIcon className="size-5" />
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{group.name}</p>

                      <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                        <p>
                          👥 {group.memberCount}{" "}
                          {group.memberCount === 1 ? "member" : "members"}
                        </p>
                        <p>👤 Created by {group.createdBy.name}</p>
                      </div>
                    </div>
                    <GroupJoinButton group={group} />
                  </CardContent>
                </Card>
              </Link>
            </div>
          ))}

          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="group flex min-h-[84px] items-center justify-center rounded-xl border border-dashed border-red-500/30 text-sm font-medium text-muted-foreground transition hover:border-red-500/50 hover:bg-muted/40 hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                {loadingMore ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <PlusIcon className="size-4 transition-transform group-hover:scale-110" />
                )}
                {loadingMore ? "Loading…" : "Load more"}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
