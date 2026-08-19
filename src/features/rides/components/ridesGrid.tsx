"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { BikeIcon, Loader2Icon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getRides } from "../actions/getRides";
import type { RideFiltersInput } from "../schemas";
import type { RideListPage } from "../types";
import { RideCard } from "./rideCard";

type RidesGridProps = {
  filters?: RideFiltersInput;
  /** Server-rendered first page, used as initial data for the empty filter. */
  initialPage?: RideListPage;
};

export function RidesGrid({ filters = {}, initialPage }: RidesGridProps) {
  const hasActiveFilters = Boolean(
    filters.search ||
      filters.pace ||
      filters.difficulty ||
      filters.includePast ||
      filters.nearLat !== undefined,
  );

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery<RideListPage>({
    queryKey: ["rides", filters],
    queryFn: ({ pageParam }) =>
      getRides({
        ...filters,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,

    initialData:
      !hasActiveFilters && initialPage
        ? { pages: [initialPage], pageParams: [undefined] }
        : undefined,
  });

  const rides = data?.pages.flatMap((page) => page.rides) ?? [];

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {["a", "b", "c"].map((key) => (
          <Skeleton key={key} className="h-72 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Something went wrong loading rides.
      </p>
    );
  }

  if (rides.length === 0) {
    if (hasActiveFilters) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <SearchXIcon className="mb-4 size-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">No rides match your filters</p>
          <p className="text-sm text-muted-foreground">
            Try a different search or reset the filters.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <BikeIcon className="mb-4 size-12 text-muted-foreground/50" />
        <p className="text-muted-foreground">No rides scheduled yet</p>
        <p className="text-sm text-muted-foreground">
          Create your first ride and invite others to join!
        </p>
        <Button asChild className="mt-4">
          <Link href="/dashboard/community-rides/new">
            Create your first ride
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rides.map((ride) => (
          <RideCard key={ride.id} ride={ride} />
        ))}
      </div>

      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage && (
              <Loader2Icon className="size-4 animate-spin" />
            )}
            Load more rides
          </Button>
        </div>
      )}
    </div>
  );
}
