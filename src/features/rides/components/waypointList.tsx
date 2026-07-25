"use client";

import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  waypointHighlightNames,
  waypointKmPositions,
  waypointStreetNames,
} from "../lib/geometry";
import type { RouteHighlight, RoutePlaceName, Waypoint } from "../types";

type WaypointListProps = {
  waypoints: Waypoint[];
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  /** When true, the first point (start) can't be removed or displaced. */
  lockedFirst?: boolean;
  /** When true, the last point (return-to-start) can't be removed or displaced. */
  lockedLast?: boolean;
  /** Route geometry; when present, points are described as "km X" along it. */
  routeCoordinates?: [number, number][];
  /** Round trips label the last point "Back at start" instead of "End". */
  roundTrip?: boolean;
  /** Known landmarks; points near one are named after it (Komoot-style). */
  highlights?: RouteHighlight[];
  /** Street-name samples; points are named after the road they sit on. */
  streetPoints?: RoutePlaceName[];
};

export function WaypointList({
  waypoints,
  onRemove,
  onMove,
  lockedFirst = false,
  lockedLast = false,
  routeCoordinates,
  roundTrip = false,
  highlights,
  streetPoints,
}: WaypointListProps) {
  // Where each point sits along the route — friendlier than raw
  // coordinates ("km 12.4" instead of "52.37001, 9.73200").
  const kmPositions = useMemo(
    () =>
      routeCoordinates && routeCoordinates.length >= 2
        ? waypointKmPositions(waypoints, routeCoordinates)
        : null,
    [waypoints, routeCoordinates],
  );

  // Real names beat any numbering. Priority per point: the street it
  // sits on ("Hildesheimer Straße"), else a landmark nearby
  // ("Lindener Berg"), else its km position.
  const streetNames = useMemo(
    () =>
      streetPoints && streetPoints.length > 0
        ? waypointStreetNames(waypoints, streetPoints)
        : null,
    [waypoints, streetPoints],
  );
  const placeNames = useMemo(
    () =>
      highlights && highlights.length > 0
        ? waypointHighlightNames(waypoints, highlights)
        : null,
    [waypoints, highlights],
  );

  const pointName = (index: number): string | null =>
    streetNames?.[index] ?? placeNames?.[index] ?? null;

  const title = (index: number): string => {
    if (index === 0) return "Start";
    if (index === waypoints.length - 1) {
      return roundTrip ? "Back at start" : "Finish";
    }
    const name = pointName(index);
    if (name) return name;
    const km = kmPositions?.[index];
    if (km !== undefined) return `km ${km.toFixed(1)}`;
    return "Point";
  };

  const subtitle = (index: number): string => {
    const km = kmPositions?.[index];
    const isMiddle = index > 0 && index < waypoints.length - 1;
    if (isMiddle && pointName(index) && km !== undefined) {
      return `km ${km.toFixed(1)}`;
    }
    const waypoint = waypoints[index];
    return `${waypoint.lat.toFixed(5)}, ${waypoint.lng.toFixed(5)}`;
  };
  if (waypoints.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        Click on the map to add your first point.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {waypoints.map((_waypoint, index) => {
        const isStart = index === 0;
        const isEnd = index === waypoints.length - 1 && waypoints.length > 1;
        const badgeClass = isStart
          ? "bg-green-500"
          : isEnd
            ? "bg-blue-500"
            : "bg-red-500";
        return (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: waypoints have no stable id
            key={index}
            className="flex items-center gap-2 rounded-lg border bg-card p-2"
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white",
                badgeClass,
              )}
            >
              {isStart ? "S" : isEnd ? "E" : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{title(index)}</p>
              <p className="truncate text-xs text-muted-foreground tabular-nums">
                {subtitle(index)}
              </p>
            </div>
            <div className="flex items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={
                  index === 0 ||
                  (lockedFirst && index === 1) ||
                  (lockedLast && index === waypoints.length - 1)
                }
                onClick={() => onMove(index, -1)}
                aria-label="Move up"
              >
                <ChevronUpIcon className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={
                  index === waypoints.length - 1 ||
                  (lockedFirst && index === 0) ||
                  (lockedLast && index === waypoints.length - 2)
                }
                onClick={() => onMove(index, 1)}
                aria-label="Move down"
              >
                <ChevronDownIcon className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={
                  (lockedFirst && index === 0) ||
                  (lockedLast && index === waypoints.length - 1)
                }
                onClick={() => onRemove(index)}
                aria-label="Remove point"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
