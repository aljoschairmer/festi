import {
  ArrowLeftIcon,
  CalendarIcon,
  MapPinIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAuth } from "@/features/auth/guards";
import { getRide } from "@/features/rides/actions/getRide";
import { CancelRideButton } from "@/features/rides/components/cancelRideButton";
import { DeleteRideButton } from "@/features/rides/components/deleteRideButton";
import { EditRideDialog } from "@/features/rides/components/editRideDialog";
import { GpxDownloadButton } from "@/features/rides/components/gpxDownloadButton";
import { PublicRideLink } from "@/features/rides/components/publicRideLink";
import { RideDate } from "@/features/rides/components/rideDate";
import { RideJoinButton } from "@/features/rides/components/rideJoinButton";
import { RideParticipants } from "@/features/rides/components/rideParticipants";
import { RidePhotos } from "@/features/rides/components/ridePhotos";
import { RideRoutePanel } from "@/features/rides/components/rideRoutePanel";
import { RouteStatsPanel } from "@/features/rides/components/routeStatsPanel";
import { formatDifficulty, formatPace } from "@/features/rides/lib/format";
import { SaveRouteDialog } from "@/features/routes/components/saveRouteDialog";

export default async function RideDetailPage({
  params,
}: {
  params: Promise<{ rideId: string }>;
}) {
  await requireAuth();
  const { rideId } = await params;
  const ride = await getRide(rideId);

  if (!ride) {
    notFound();
  }

  const isCancelled = ride.status === "CANCELLED";
  const isFull =
    ride.maxParticipants !== null &&
    ride.participantCount >= ride.maxParticipants;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/dashboard/community-rides" aria-label="Back to rides">
            <ArrowLeftIcon className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{ride.title}</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarIcon className="size-3.5" />
            <RideDate startTime={ride.startTime} style="long" />
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {isCancelled && <Badge variant="destructive">Cancelled</Badge>}
            {ride.group && (
              <Badge asChild variant="outline">
                <Link href={`/dashboard/community/g/${ride.group.id}`}>
                  <UsersIcon className="size-3" />
                  {ride.group.name}
                </Link>
              </Badge>
            )}
            {ride.pace && (
              <Badge variant="secondary">{formatPace(ride.pace)}</Badge>
            )}
            {ride.difficulty && (
              <Badge variant="secondary">
                {formatDifficulty(ride.difficulty)}
              </Badge>
            )}
            {ride.maxParticipants !== null && (
              <Badge variant="outline">
                {ride.participantCount}/{ride.maxParticipants} spots
              </Badge>
            )}
            {isFull && <Badge variant="destructive">Full</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {ride.isCreator && !isCancelled && (
            <>
              <EditRideDialog ride={ride} />
              <CancelRideButton
                rideId={ride.id}
                hasSeries={ride.recurrenceId !== null}
              />
            </>
          )}
          {ride.isCreator && <DeleteRideButton rideId={ride.id} />}
          {(ride.isCreator || ride.participantStatus === "APPROVED") && (
            <>
              <GpxDownloadButton rideId={ride.id} />
              <SaveRouteDialog rideId={ride.id} rideTitle={ride.title} />
            </>
          )}
          <RideJoinButton
            rideId={ride.id}
            isCreator={ride.isCreator}
            participantStatus={ride.participantStatus}
            rideStatus={ride.status}
            isFull={isFull}
            isPast={new Date(ride.startTime).getTime() < Date.now()}
          />
        </div>
      </div>

      {ride.isCreator && (
        <PublicRideLink rideId={ride.id} isPublic={ride.isPublic} />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <RideRoutePanel
              routeGeometry={ride.routeGeometry}
              waypoints={ride.waypoints}
              elevationProfile={ride.elevationProfile}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <RouteStatsPanel
            route={{
              distance: ride.distance,
              duration: ride.duration,
              elevationGain: ride.elevationGain,
              elevationLoss: ride.elevationLoss,
              routeGeometry: ride.routeGeometry,
              coordinates: [],
              elevationProfile: ride.elevationProfile,
            }}
          />

          {ride.description && (
            <Card>
              <CardContent className="py-4 text-sm whitespace-pre-wrap">
                {ride.description}
              </CardContent>
            </Card>
          )}

          {ride.startLocation && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPinIcon className="mt-0.5 size-4 shrink-0 text-green-500" />
              <span>Starts at {ride.startLocation}</span>
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            Created by{" "}
            <span className="text-foreground">
              {ride.creator.username ?? ride.creator.name}
            </span>
          </p>

          <RideParticipants
            isCreator={ride.isCreator}
            creator={ride.creator}
            participants={ride.participants}
            maxParticipants={ride.maxParticipants}
            isPast={new Date(ride.startTime).getTime() < Date.now()}
          />

          <RidePhotos
            rideId={ride.id}
            photos={ride.photos}
            title={ride.title}
            canManage={
              ride.isCreator && new Date(ride.startTime).getTime() < Date.now()
            }
          />
        </div>
      </div>
    </div>
  );
}
