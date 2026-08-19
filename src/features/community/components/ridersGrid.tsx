"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getRiders } from "../actions/getRiders";
import type { Rider } from "../types";

const PAGE_SIZE = 5;

export function RidersGrid() {
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const {
    data: riders = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Rider[]>({
    queryKey: ["riders"],
    queryFn: () => getRiders(),
  });

  const filteredRiders = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) return riders;

    return riders.filter((rider) =>
      [rider.name, rider.username]
        .filter(Boolean)
        .some((value) => (value ?? "").toLowerCase().includes(query)),
    );
  }, [riders, search]);

  // Reset paging whenever the search changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on search change
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [search]);

  const shownRiders = filteredRiders.slice(0, visible);
  const hasMore = filteredRiders.length > visible;

  const loadMore = () => {
    setLoadingMore(true);
    // Small delay so the loading animation is visible before revealing.
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
    return (
      <div className="flex items-center gap-3">
        <p className="text-sm text-destructive">Failed to load riders.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Label htmlFor="riders-search" className="sr-only">
          Search riders
        </Label>
        <Input
          id="riders-search"
          placeholder="Search riders..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredRiders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <UserIcon className="mb-4 size-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">No riders found</p>
          <p className="text-sm text-muted-foreground">
            Try searching for another name or username.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shownRiders.map((rider, index) => (
            <div
              key={rider.id}
              className="duration-500 animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
              style={{ animationDelay: `${(index % PAGE_SIZE) * 60}ms` }}
            >
              <Link
                href={`/dashboard/community/u/${rider.id}`}
                prefetch={false}
              >
                <Card className="h-full transition hover:border-primary/40 hover:bg-muted/40">
                  <CardContent className="flex items-center gap-4 p-4">
                    <Avatar className="size-12">
                      <AvatarImage src={rider.image ?? undefined} />
                      <AvatarFallback>
                        {rider.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex w-full items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 truncate font-medium">
                          {rider.name}
                          <BadgeCheck
                            size={15}
                            color={
                              rider.role === "admin" ? "#eab308" : "#3b82f6"
                            }
                          />
                        </p>

                        <p className="truncate text-sm text-muted-foreground">
                          @{rider.username ?? "rider"}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium">Joined</p>
                        <p className="text-sm text-muted-foreground">
                          {new Intl.DateTimeFormat("en", {
                            dateStyle: "medium",
                          }).format(new Date(rider.createdAt))}
                        </p>
                      </div>
                    </div>
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
              className="group flex min-h-[84px] items-center justify-center rounded-xl border border-dashed border-primary/30 text-sm font-medium text-muted-foreground transition hover:border-primary/50 hover:bg-muted/40 hover:text-foreground"
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
