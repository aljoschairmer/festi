import { format } from "date-fns";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  MapPinOffIcon,
  MountainIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getStageDetail } from "@/features/pro/actions/getStageDetail";
import { getStageReplay } from "@/features/pro/actions/getStageReplay";
import { LiveStagePanel } from "@/features/pro/components/liveStagePanel";
import { ReplayPanel } from "@/features/pro/components/replayPanel";
import { StageNewsFeed } from "@/features/pro/components/stageNewsFeed";
import { StageRoutePanel } from "@/features/pro/components/stageRoutePanel";
import { formatStageType } from "@/features/pro/lib/format";
import { poisToDots } from "@/features/pro/lib/riderDots";

function formatMeters(meters: number): string {
  return `${Math.round(meters).toLocaleString("en-US")} m`;
}

export default async function ProStagePage({
  params,
}: {
  params: Promise<{ race: string; year: string; stage: string }>;
}) {
  const { race: raceKey, year: yearParam, stage: stageParam } = await params;
  const year = Number.parseInt(yearParam, 10);
  const stageNumber = Number.parseInt(stageParam, 10);
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2100 ||
    !Number.isInteger(stageNumber) ||
    stageNumber < 0
  ) {
    notFound();
  }

  const detail = await getStageDetail(raceKey, year, stageNumber);
  if (!detail) {
    notFound();
  }

  const { stage, route } = detail;

  const today = new Date().toISOString().slice(0, 10);
  const isRaceDay = stage.date !== null && stage.date === today;
  const isPast = stage.date !== null && stage.date < today;
  const replay =
    isPast && route !== null
      ? await getStageReplay(raceKey, year, stageNumber)
      : null;

  const title = stageNumber === 0 ? "Prologue" : `Stage ${stageNumber}`;
  const distanceKm =
    route !== null
      ? Math.round(route.distanceMeters / 100) / 10
      : stage.distanceKm;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link
            href={`/dashboard/pro/${detail.raceKey}/${detail.year}`}
            aria-label={`Back to ${detail.raceName}`}
          >
            <ArrowLeftIcon className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {detail.raceName} {detail.year}
            {stage.date && ` · ${format(new Date(stage.date), "EEEE, MMM d")}`}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {stage.departure && stage.arrival && (
              <Badge variant="outline">
                {stage.departure}
                <ArrowRightIcon className="size-3" />
                {stage.arrival}
              </Badge>
            )}
            {formatStageType(stage.type) && (
              <Badge variant="secondary">{formatStageType(stage.type)}</Badge>
            )}
            {distanceKm !== null && (
              <Badge variant="secondary">{distanceKm} km</Badge>
            )}
            {route !== null && route.elevationGain > 0 && (
              <Badge variant="secondary">
                ↗ {formatMeters(route.elevationGain)}
              </Badge>
            )}
            {route !== null && route.elevationLoss > 0 && (
              <Badge variant="secondary">
                ↘ {formatMeters(route.elevationLoss)}
              </Badge>
            )}
            {route !== null &&
              route.minEle !== null &&
              route.maxEle !== null && (
                <Badge variant="outline">
                  <MountainIcon className="size-3" />
                  {formatMeters(route.minEle)} – {formatMeters(route.maxEle)}
                </Badge>
              )}
          </div>
        </div>
      </div>

      {route === null && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <MapPinOffIcon className="size-5 shrink-0" />
            No GPX route is published for this stage yet — the map and elevation
            profile will appear once it is.
          </CardContent>
        </Card>
      )}

      {isRaceDay ? (
        <LiveStagePanel
          raceKey={detail.raceKey}
          year={detail.year}
          stageNumber={stageNumber}
          route={route}
          pois={detail.pois}
          departure={stage.departure}
          arrival={stage.arrival}
          news={detail.news}
        />
      ) : replay !== null && replay.frames.length > 0 && route !== null ? (
        <ReplayPanel
          route={route}
          frames={replay.frames}
          pois={detail.pois}
          departure={stage.departure}
          arrival={stage.arrival}
          news={detail.news}
        />
      ) : (
        route !== null && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <StageRoutePanel
                  routeGeometry={route.routeGeometry}
                  waypoints={route.waypoints}
                  elevationProfile={route.elevationProfile}
                  riderDots={
                    detail.pois.length > 0 ? poisToDots(detail.pois) : undefined
                  }
                  pois={detail.pois}
                  departure={stage.departure}
                  arrival={stage.arrival}
                />
              </CardContent>
            </Card>

            <div className="relative">
              <StageNewsFeed
                articles={detail.news}
                className="lg:absolute lg:inset-0"
              />
            </div>
          </div>
        )
      )}

      <p className="text-xs text-muted-foreground">
        Route data:{" "}
        {route?.sourceUrl ? (
          <a
            href={route.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {route.sourceUrl.includes("tissottiming")
              ? "Tissot"
              : "cyclingstage.com"}
          </a>
        ) : (
          "cyclingstage.com"
        )}
        {" · "}Race data: ASO / Tissot
      </p>
    </div>
  );
}
