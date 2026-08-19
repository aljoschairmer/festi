"use client";

import {
  FlagIcon,
  GaugeIcon,
  MountainIcon,
  ThermometerIcon,
  TimerIcon,
  WindIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatGap } from "../lib/format";
import {
  DEFAULT_RIDER_COLOR,
  JERSEY_COLORS,
  JERSEY_LABELS,
  poisToDots,
  ridersToDots,
} from "../lib/riderDots";
import type {
  ProLiveStageData,
  ProNewsArticle,
  ProStagePoi,
  ProStageRoute,
} from "../types";
import { StageNewsFeed } from "./stageNewsFeed";
import { StageRoutePanel } from "./stageRoutePanel";

type LiveStagePanelProps = {
  raceKey: string;
  year: number;
  stageNumber: number;
  /** Null when no GPX route is published for this stage. */
  route: ProStageRoute | null;
  /** KOM climbs and sprints drawn on the map under the rider dots. */
  pois: ProStagePoi[];
  /** Roadbook start/finish city names for the profile flags. */
  departure?: string | null;
  arrival?: string | null;
  /** Initial commentary feed; the live snapshot supersedes it mid-stage. */
  news?: ProNewsArticle[];
};

function LiveBadge() {
  return (
    <Badge className="gap-1.5 bg-primary text-white hover:bg-primary/80">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-white" />
      </span>
      Live
    </Badge>
  );
}

function LiveInfoStrip({ data }: { data: ProLiveStageData }) {
  const info = data.info;
  // Spread of the race: the biggest gap among GPS-tracked riders.
  const maxGap = data.riders.reduce(
    (max, rider) => Math.max(max, rider.secToFirstRider ?? 0),
    0,
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <LiveBadge />
      {info?.kmToFinish !== null && info?.kmToFinish !== undefined && (
        <Badge variant="secondary">
          <FlagIcon className="size-3" />
          {info.kmToFinish} km to go
        </Badge>
      )}
      {info?.speedKph !== null && info?.speedKph !== undefined && (
        <Badge variant="secondary">
          <GaugeIcon className="size-3" />
          {info.speedKph} km/h at the front
        </Badge>
      )}
      {maxGap > 0 && (
        <Badge variant="secondary">
          <TimerIcon className="size-3" />
          {formatGap(maxGap)} spread
        </Badge>
      )}
      {info?.temperatureC !== null && info?.temperatureC !== undefined && (
        <Badge variant="outline">
          <ThermometerIcon className="size-3" />
          {info.temperatureC} °C
        </Badge>
      )}
      {info?.gradientPct !== null && info?.gradientPct !== undefined && (
        <Badge variant="outline">
          <MountainIcon className="size-3" />
          {info.gradientPct}%
        </Badge>
      )}
      {data.weather?.description && (
        <Badge variant="outline" title={data.weather.place ?? undefined}>
          {data.weather.description}
        </Badge>
      )}
      {data.weather?.windKph !== null &&
        data.weather?.windKph !== undefined && (
          <Badge variant="outline" title={data.weather.place ?? undefined}>
            <WindIcon className="size-3" />
            {data.weather.windKph} km/h
            {data.weather.windDirection ? ` ${data.weather.windDirection}` : ""}
          </Badge>
        )}
    </div>
  );
}

function JerseyHolders({ data }: { data: ProLiveStageData }) {
  if (data.jerseyHolders.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {data.jerseyHolders.map((holder) => (
        <Badge
          key={holder.jersey}
          variant="outline"
          className="gap-1.5"
          title={JERSEY_LABELS[holder.jersey]}
        >
          <span
            className="size-2.5 rounded-full border border-black/20"
            style={{ backgroundColor: JERSEY_COLORS[holder.jersey] }}
          />
          {holder.rider}
        </Badge>
      ))}
    </div>
  );
}

function JerseyLegend() {
  const entries = [
    ...Object.entries(JERSEY_LABELS).map(([jersey, label]) => ({
      color: JERSEY_COLORS[jersey as keyof typeof JERSEY_COLORS],
      label,
    })),
    { color: DEFAULT_RIDER_COLOR, label: "GPS-tracked rider" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {entries.map((entry) => (
        <span key={entry.label} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full border border-black/20"
            style={{ backgroundColor: entry.color }}
          />
          {entry.label}
        </span>
      ))}
    </div>
  );
}

function LiveRankingCard({ data }: { data: ProLiveStageData }) {
  if (data.ranking.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Live standings</CardTitle>
        {data.rankingSource && (
          <Badge variant="secondary">
            {data.rankingSource === "tissot" ? "Tissot" : "ASO"}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Rank</TableHead>
              <TableHead>Rider</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="w-16">Nation</TableHead>
              <TableHead className="text-right">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.ranking.map((row, index) => (
              <TableRow key={`${row.rank ?? index}-${row.rider}`}>
                <TableCell className="font-mono text-xs">
                  {row.rank ?? "–"}
                </TableCell>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    {row.riderPhotoUrl && (
                      // biome-ignore lint/performance/noImgElement: external ASO CDN photo
                      <img
                        src={row.riderPhotoUrl}
                        alt=""
                        loading="lazy"
                        className="size-7 shrink-0 rounded-full bg-muted object-cover"
                      />
                    )}
                    <span className="truncate">{row.rider}</span>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.team ?? ""}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.nation ?? ""}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {row.gap || row.time || ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * Live coverage for a stage that may currently be racing: subscribes to the
 * SSE stream while the tab is visible and layers rider GPS dots onto the
 * stage map. Outside live racing it renders the static route panel plus a
 * subtle hint, so the page looks like the regular stage page.
 */
export function LiveStagePanel({
  raceKey,
  year,
  stageNumber,
  route,
  pois,
  departure,
  arrival,
  news,
}: LiveStagePanelProps) {
  const [data, setData] = useState<ProLiveStageData | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;

    const open = () => {
      if (source) return;
      // Every event is a complete snapshot, so reconnects (EventSource
      // retries automatically) need no patch replay — the next event
      // re-syncs the panel.
      source = new EventSource(
        `/api/pro/live/${encodeURIComponent(raceKey)}/${year}/${stageNumber}`,
      );
      source.addEventListener("snapshot", (event) => {
        try {
          setData(JSON.parse((event as MessageEvent<string>).data));
        } catch {
          // A malformed frame keeps the previous snapshot; never crash.
        }
      });
      // Errors are left to EventSource's built-in retry; the last snapshot
      // stays on screen meanwhile.
    };

    const close = () => {
      source?.close();
      source = null;
    };

    // Hold the connection only while the tab is visible — each open stream
    // costs a running worker invocation.
    const onVisibilityChange = () => {
      if (document.hidden) {
        close();
      } else {
        open();
      }
    };

    if (!document.hidden) open();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      close();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [raceKey, year, stageNumber]);

  const live = data?.live === true;
  const dots = useMemo(() => {
    // POI dots have a smaller radius, so the rider dots draw on top of them.
    const poiDots = poisToDots(pois);
    if (live && data) return [...poiDots, ...ridersToDots(data.riders)];
    return poiDots.length > 0 ? poiDots : undefined;
  }, [live, data, pois]);

  return (
    <div className="space-y-4">
      {live && data && <LiveInfoStrip data={data} />}

      {live && data && <JerseyHolders data={data} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {route && (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <StageRoutePanel
                routeGeometry={route.routeGeometry}
                waypoints={route.waypoints}
                elevationProfile={route.elevationProfile}
                riderDots={dots}
                pois={pois}
                departure={departure}
                arrival={arrival}
              />
            </CardContent>
          </Card>
        )}
        {/* The absolute wrapper caps the feed at the map column's height on
            large screens; on mobile it stacks below with its own scroll. */}
        <div className="relative">
          <StageNewsFeed
            articles={data?.news?.length ? data.news : (news ?? [])}
            live={live}
            className="lg:absolute lg:inset-0"
          />
        </div>
      </div>

      {live && dots && dots.length > 0 && <JerseyLegend />}

      {live && data && <LiveRankingCard data={data} />}

      {!live && (
        <p className="text-xs text-muted-foreground">
          Live tracking appears here during the stage.
        </p>
      )}
    </div>
  );
}
