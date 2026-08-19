"use client";

import { formatDistanceToNow } from "date-fns";
import {
  BikeIcon,
  ClockIcon,
  ImageIcon,
  MapPinIcon,
  MountainIcon,
} from "lucide-react";
import Link from "next/link";
import { RideJoinButton } from "@/features/rides/components/rideJoinButton";
import { RouteThumbnail } from "@/features/rides/components/routeThumbnail";
import {
  formatDistance,
  formatDuration,
  formatElevation,
} from "@/features/rides/lib/format";
import type { RideSummary } from "@/features/rides/types";
import { cn } from "@/lib/utils";

type RideTimelineCardProps = {
  ride: RideSummary;
};

/** A ride entry styled to match {@link PostCard} in the "For You" timeline. */
export function RideTimelineCard({ ride }: RideTimelineCardProps) {
  const href = `/dashboard/community-rides/${ride.id}`;
  const profileHref = `/dashboard/community/u/${ride.creator.id}`;
  const creatorLabel = ride.creator.username ?? ride.creator.name;
  const isPast = new Date(ride.startTime).getTime() < Date.now();

  return (
    <article
      className={cn(
        "group relative rounded-xl border bg-card p-5 transition-shadow hover:shadow-md",
        isPast
          ? "border-border"
          : "border-primary/40 shadow-sm ring-1 ring-primary/20",
      )}
    >
      {/* Full-card click target to the ride page. Interactive elements below
          sit above it via z-10. */}
      <Link
        href={href}
        aria-label={ride.title}
        className="absolute inset-0 z-0 rounded-xl"
      />

      <div className="pointer-events-none relative z-10 flex flex-col gap-5 lg:flex-row">
        {/* Left: ride details */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isPast ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                <BikeIcon className="size-3.5" />
                Past ride
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 font-medium text-white">
                <BikeIcon className="size-3.5" />
                Upcoming ride
              </span>
            )}
            {isPast && ride.photoCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                <ImageIcon className="size-3.5" />
                {ride.photoCount} {ride.photoCount === 1 ? "photo" : "photos"}
              </span>
            )}
            <span>
              by{" "}
              <Link
                href={profileHref}
                prefetch={false}
                className="pointer-events-auto font-medium text-foreground hover:underline"
              >
                {creatorLabel}
              </Link>{" "}
              ·{" "}
              {formatDistanceToNow(new Date(ride.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>

          <div>
            <h2 className="font-heading text-lg font-semibold group-hover:underline">
              {ride.title}
            </h2>
            {ride.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {ride.description}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {formatDistance(ride.distance)}
            </span>
            <span className="flex items-center gap-1">
              <MountainIcon className="size-3.5" />
              {formatElevation(ride.elevationGain)}
            </span>
            <span className="flex items-center gap-1">
              <ClockIcon className="size-3.5" />
              {formatDuration(ride.duration)}
            </span>
          </div>

          {ride.startLocation && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-green-500" />
              <span className="line-clamp-1">{ride.startLocation}</span>
            </p>
          )}

          <div className="pointer-events-auto mt-auto flex items-center gap-2 pt-1">
            <RideJoinButton
              rideId={ride.id}
              isCreator={ride.isCreator}
              participantStatus={ride.participantStatus}
              rideStatus={ride.status}
              isFull={
                ride.maxParticipants !== null &&
                ride.participantCount >= ride.maxParticipants
              }
              isPast={isPast}
            />
            {ride.participantCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {ride.participantCount} joined
              </span>
            )}
          </div>
        </div>

        {/* Right: route preview */}
        <div className="h-36 overflow-hidden rounded-lg border lg:h-auto lg:max-h-44 lg:w-56 lg:shrink-0">
          <RouteThumbnail routeGeometry={ride.routeGeometry} />
        </div>
      </div>
    </article>
  );
}
