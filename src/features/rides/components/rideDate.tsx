"use client";

import { formatRideDate } from "../lib/format";

type RideDateProps = {
  /** ISO 8601 timestamp (as returned by the ride actions). */
  startTime: string;
  style?: "short" | "long";
  className?: string;
};

/**
 * Renders a ride start time in the viewer's local timezone. The server
 * would format it in the server timezone (UTC on Workers) — the reason
 * detail pages used to disagree with the client-rendered list — so the
 * formatted text is allowed to change during hydration.
 */
export function RideDate({
  startTime,
  style = "short",
  className,
}: RideDateProps) {
  const date = new Date(startTime);
  return (
    <time
      dateTime={date.toISOString()}
      className={className}
      suppressHydrationWarning
    >
      {formatRideDate(date, style)}
    </time>
  );
}
