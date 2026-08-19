import { BikeIcon, ClockIcon, MapPinIcon, MountainIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  formatDifficulty,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  formatRideDate,
} from "../lib/format";
import type { RideListItem } from "../types";
import { RideJoinButton } from "./rideJoinButton";
import { RouteThumbnail } from "./routeThumbnail";

type RideCardProps = {
  ride: RideListItem;
};

export function RideCard({ ride }: RideCardProps) {
  const href = `/dashboard/community-rides/${ride.id}`;
  const isFull =
    ride.maxParticipants !== null &&
    ride.participantCount >= ride.maxParticipants;

  return (
    <Card className="gap-0 py-0">
      <Link href={href} className="block h-40 w-full">
        <RouteThumbnail routeGeometry={ride.routeGeometry} />
      </Link>

      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-start gap-2">
          <BikeIcon className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <Link
              href={href}
              className="font-heading font-medium hover:underline"
            >
              {ride.title}
            </Link>
            <p className="text-xs text-muted-foreground">
              {formatRideDate(ride.startTime)}
            </p>
            {(ride.pace || ride.difficulty) && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {ride.pace && (
                  <Badge variant="secondary">{formatPace(ride.pace)}</Badge>
                )}
                {ride.difficulty && (
                  <Badge variant="secondary">
                    {formatDifficulty(ride.difficulty)}
                  </Badge>
                )}
              </div>
            )}
          </div>
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

        <p className="text-xs text-muted-foreground">
          Created by {ride.creator.username ?? ride.creator.name}
          {ride.maxParticipants !== null
            ? ` · ${ride.participantCount}/${ride.maxParticipants} spots`
            : ride.participantCount > 0 && ` · ${ride.participantCount} joined`}
        </p>
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t py-3">
        <Button asChild variant="outline" size="sm">
          <Link href={href}>View Route</Link>
        </Button>
        <RideJoinButton
          rideId={ride.id}
          isCreator={ride.isCreator}
          participantStatus={ride.participantStatus}
          rideStatus={ride.status}
          isFull={isFull}
          isPast={new Date(ride.startTime).getTime() < Date.now()}
        />
      </CardFooter>
    </Card>
  );
}
