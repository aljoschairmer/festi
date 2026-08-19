/** Presentation helpers for ride statistics. */

import type { RideDifficulty, RidePace } from "../types";

export const RIDE_PACE_OPTIONS: { value: RidePace; label: string }[] = [
  { value: "relaxed", label: "Relaxed" },
  { value: "social", label: "Social" },
  { value: "tempo", label: "Tempo" },
  { value: "fast", label: "Fast" },
];

export const RIDE_DIFFICULTY_OPTIONS: {
  value: RideDifficulty;
  label: string;
}[] = [
  { value: "easy", label: "Easy" },
  { value: "moderate", label: "Moderate" },
  { value: "hard", label: "Hard" },
  { value: "expert", label: "Expert" },
];

/** Human label for a pace value, e.g. `Tempo`. */
export function formatPace(pace: RidePace): string {
  return (
    RIDE_PACE_OPTIONS.find((option) => option.value === pace)?.label ?? pace
  );
}

/** Human label for a difficulty value, e.g. `Hard`. */
export function formatDifficulty(difficulty: RideDifficulty): string {
  return (
    RIDE_DIFFICULTY_OPTIONS.find((option) => option.value === difficulty)
      ?.label ?? difficulty
  );
}

/** Formats a distance in meters as kilometers, e.g. `62.0 km`. */
export function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Formats a duration in seconds as `3h 20min` or `45min`. */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}min`;
  }

  return `${hours}h ${minutes.toString().padStart(2, "0")}min`;
}

/** Formats an elevation value in meters, e.g. `820 hm`. */
export function formatElevation(meters: number): string {
  return `${Math.round(meters)} hm`;
}

/**
 * Parses a ride start time coming from a `datetime-local` input.
 *
 * `datetime-local` values ("2026-08-19T10:00") carry no timezone offset.
 * ISO strings with an explicit offset or "Z" are handed to the native
 * parser unchanged. Naive values are interpreted as wall-clock time in
 * the server's local timezone — on Cloudflare Workers that is UTC, which
 * is almost never what the user meant (this mismatch was F-07). The ride
 * forms therefore convert to a full ISO string with offset in the
 * browser before submitting; this naive branch is only the documented
 * fallback for clients that still send raw input values.
 */
export function parseLocalDateTime(value: string): Date {
  const naive =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/.exec(
      value,
    );
  if (naive) {
    const [, year, month, day, hour, minute, second] = naive;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second ?? "0"),
    );
  }
  return new Date(value);
}
