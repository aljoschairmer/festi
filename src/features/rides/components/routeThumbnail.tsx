"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { decodeRouteGeometry } from "../lib/geometry";

type RouteThumbnailProps = {
  routeGeometry: string;
  className?: string;
};

const WIDTH = 320;
const HEIGHT = 160;
const PADDING = 12;

/**
 * Lightweight SVG preview of a route shape. Unlike a full map it uses no WebGL
 * context or tile requests, so it scales to many cards in a grid.
 */
export function RouteThumbnail({
  routeGeometry,
  className,
}: RouteThumbnailProps) {
  const shape = useMemo(() => {
    const coords = decodeRouteGeometry(routeGeometry);
    if (coords.length < 2) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const latRad = (coords[0][1] * Math.PI) / 180;
    const lngScale = Math.cos(latRad);

    const projected = coords.map(([lng, lat]) => {
      const x = lng * lngScale;
      const y = -lat;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      return [x, y] as const;
    });

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const scale = Math.min(
      (WIDTH - PADDING * 2) / spanX,
      (HEIGHT - PADDING * 2) / spanY,
    );
    const offsetX = (WIDTH - spanX * scale) / 2;
    const offsetY = (HEIGHT - spanY * scale) / 2;

    const points = projected.map(
      ([x, y]) =>
        [offsetX + (x - minX) * scale, offsetY + (y - minY) * scale] as const,
    );

    const path = points
      .map(
        ([px, py], index) =>
          `${index === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`,
      )
      .join(" ");

    const [firstLng, firstLat] = coords[0];
    const [lastLng, lastLat] = coords[coords.length - 1];
    const isRoundTrip =
      Math.abs(firstLng - lastLng) < 1e-5 &&
      Math.abs(firstLat - lastLat) < 1e-5;

    return {
      path,
      start: points[0],
      end: points[points.length - 1],
      isRoundTrip,
    };
  }, [routeGeometry]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={cn("h-full w-full bg-muted/40", className)}
      role="img"
      aria-label="Route preview"
      preserveAspectRatio="xMidYMid meet"
    >
      {shape && (
        <>
          <path
            d={shape.path}
            fill="none"
            stroke="#ef4444"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {!shape.isRoundTrip && (
            <circle
              cx={shape.end[0]}
              cy={shape.end[1]}
              r={4.5}
              fill="#3b82f6"
              stroke="#fff"
              strokeWidth={1.5}
            />
          )}
          <circle
            cx={shape.start[0]}
            cy={shape.start[1]}
            r={4.5}
            fill="#22c55e"
            stroke="#fff"
            strokeWidth={1.5}
          />
        </>
      )}
    </svg>
  );
}
