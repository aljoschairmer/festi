import {
  ArrowRightIcon,
  CalendarIcon,
  MapPinIcon,
  MountainIcon,
  RouteIcon,
  TimerIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicRide } from "@/features/rides/actions/getPublicRide";
import { RideDate } from "@/features/rides/components/rideDate";
import { RouteThumbnail } from "@/features/rides/components/routeThumbnail";
import {
  formatDifficulty,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
} from "@/features/rides/lib/format";

/**
 * Public, logged-out view of a ride. Shows the route, stats and a join CTA —
 * never any participant identities. Private or missing rides render a notice.
 */
export default async function PublicRidePage({
  params,
}: {
  params: Promise<{ rideId: string }>;
}) {
  const { rideId } = await params;
  const ride = await getPublicRide(rideId);

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link
          href="/"
          aria-label="Festi home"
          className="flex items-center gap-3"
        >
          <Logo size={32} />
          <span className="font-heading text-lg font-semibold">Festi</span>
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
        {!ride ? (
          <Card>
            <CardHeader>
              <CardTitle>This ride is not public</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The ride doesn&apos;t exist, or its creator has disabled the
                public link.
              </p>
              <Button asChild>
                <Link href="/">
                  Back to Festi
                  <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {ride.status === "CANCELLED" && (
                  <Badge variant="destructive">Cancelled</Badge>
                )}
                {ride.pace && (
                  <Badge variant="secondary">{formatPace(ride.pace)}</Badge>
                )}
                {ride.difficulty && (
                  <Badge variant="secondary">
                    {formatDifficulty(ride.difficulty)}
                  </Badge>
                )}
              </div>
              <h1 className="font-heading text-3xl font-bold">{ride.title}</h1>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon className="size-4" />
                  <RideDate startTime={ride.startTime} style="long" />
                </span>
                {ride.startLocation && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPinIcon className="size-4" />
                    {ride.startLocation}
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                Organized by {ride.creatorName}
              </p>
            </div>

            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="overflow-hidden rounded-lg border">
                  <RouteThumbnail
                    routeGeometry={ride.routeGeometry}
                    className="h-48 w-full"
                  />
                </div>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/50 p-3">
                    <RouteIcon className="size-4 text-muted-foreground" />
                    <dd className="font-semibold">
                      {formatDistance(ride.distance)}
                    </dd>
                    <dt className="text-xs text-muted-foreground">Distance</dt>
                  </div>
                  <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/50 p-3">
                    <TimerIcon className="size-4 text-muted-foreground" />
                    <dd className="font-semibold">
                      {formatDuration(ride.duration)}
                    </dd>
                    <dt className="text-xs text-muted-foreground">Duration</dt>
                  </div>
                  <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/50 p-3">
                    <MountainIcon className="size-4 text-muted-foreground" />
                    <dd className="font-semibold">
                      {formatElevation(ride.elevationGain)}
                    </dd>
                    <dt className="text-xs text-muted-foreground">Climbing</dt>
                  </div>
                  <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/50 p-3">
                    <UsersIcon className="size-4 text-muted-foreground" />
                    <dd className="font-semibold">
                      {ride.maxParticipants
                        ? `${ride.participantCount}/${ride.maxParticipants}`
                        : ride.participantCount}
                    </dd>
                    <dt className="text-xs text-muted-foreground">Riders</dt>
                  </div>
                </dl>
                {ride.description && (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">
                    {ride.description}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-primary/30">
              <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
                <p className="font-heading text-lg font-semibold">
                  Want to ride along?
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Join Festi to request a spot, see who&apos;s coming, and find
                  more rides near you.
                </p>
                <div className="flex gap-3">
                  <Button asChild>
                    <Link href="/register">Create free account</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/login">Sign in</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
