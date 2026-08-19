"use client";

import { format } from "date-fns";
import { PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { poisToDots, ridersToDots } from "../lib/riderDots";
import type {
  ProNewsArticle,
  ProReplayFrame,
  ProStagePoi,
  ProStageRoute,
} from "../types";
import { StageNewsFeed } from "./stageNewsFeed";
import { StageRoutePanel } from "./stageRoutePanel";

/** Playback advances one captured frame per tick. */
const PLAYBACK_TICK_MS = 400;

type ReplayPanelProps = {
  route: ProStageRoute;
  /** Captured frames in chronological order; never empty. */
  frames: ProReplayFrame[];
  /** KOM climbs and sprints drawn on the map under the rider dots. */
  pois: ProStagePoi[];
  /** Roadbook start/finish city names for the profile flags. */
  departure?: string | null;
  arrival?: string | null;
  /** Archived commentary feed shown next to the map. */
  news?: ProNewsArticle[];
};

/**
 * Scrubbable replay of a past stage from captured telemetry frames: a time
 * slider plus play/pause, animating the rider dots along the stage route.
 */
export function ReplayPanel({
  route,
  frames,
  pois,
  departure,
  arrival,
  news,
}: ReplayPanelProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const clampedIndex = Math.min(frameIndex, frames.length - 1);
  const frame = frames[clampedIndex];

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setFrameIndex((index) => {
        if (index >= frames.length - 1) {
          setPlaying(false);
          return index;
        }
        return index + 1;
      });
    }, PLAYBACK_TICK_MS);
    return () => clearInterval(timer);
  }, [playing, frames.length]);

  const dots = useMemo(
    () => [...poisToDots(pois), ...(frame ? ridersToDots(frame.riders) : [])],
    [frame, pois],
  );

  if (!frame) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
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

        <div className="relative">
          <StageNewsFeed
            articles={news ?? []}
            className="lg:absolute lg:inset-0"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="shrink-0">
          Replay
        </Badge>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            if (!playing && clampedIndex >= frames.length - 1) {
              setFrameIndex(0);
            }
            setPlaying((value) => !value);
          }}
          aria-label={playing ? "Pause replay" : "Play replay"}
        >
          {playing ? (
            <PauseIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4" />
          )}
        </Button>
        <Slider
          value={[clampedIndex]}
          min={0}
          max={frames.length - 1}
          step={1}
          onValueChange={(value) => {
            setPlaying(false);
            setFrameIndex(value[0] ?? 0);
          }}
          aria-label="Replay position"
        />
        <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">
          {format(new Date(frame.capturedAt), "HH:mm:ss")}
        </span>
      </div>
    </div>
  );
}
