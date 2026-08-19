import type { ElevationMarker, ElevationPoint } from "@/features/rides/types";
import type { ProStagePoi } from "../types";

/**
 * POIs whose nearest profile point is farther away than this are dropped —
 * their coordinates don't belong to this route (bad upstream data).
 */
const MAX_SNAP_METERS = 3000;

/** Approximate squared distance in meters between two coordinates. */
function distanceSquaredMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = (aLat - bLat) * 111_000;
  const dLng = (aLng - bLng) * 111_000 * Math.cos((aLat * Math.PI) / 180);
  return dLat * dLat + dLng * dLng;
}

/**
 * Snaps a POI onto the profile by coordinates rather than trusting ASO's km
 * marks: the profile's own distance scale (GPX or KMZ derived) can differ
 * from the official roadbook kms, and snapping keeps the flag, the dot and
 * the map marker aligned to the same spot.
 */
function nearestProfilePoint(
  profile: ElevationPoint[],
  lat: number,
  lng: number,
): { point: ElevationPoint; distanceSquared: number } {
  let best = profile[0];
  let bestDist = Infinity;
  for (const point of profile) {
    const dist = distanceSquaredMeters(lat, lng, point.lat, point.lng);
    if (dist < bestDist) {
      bestDist = dist;
      best = point;
    }
  }
  return { point: best, distanceSquared: bestDist };
}

function komTitle(poi: ProStagePoi): string {
  return [
    poi.name,
    poi.category ? `Cat. ${poi.category}` : null,
    poi.climbLengthMeters !== null
      ? `${(poi.climbLengthMeters / 1000).toFixed(1)} km climb`
      : null,
    poi.gradientPct !== null ? `${poi.gradientPct}%` : null,
    poi.km !== null ? `km ${poi.km}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Builds the flag markers for the stage's elevation profile: start and finish
 * (labeled with the roadbook cities when known) plus every KOM climb and
 * sprint POI snapped onto the profile. Markers are staggered over two rows so
 * neighboring labels don't overlap — same idea as the official ASO profiles.
 */
export function buildElevationMarkers(
  profile: ElevationPoint[],
  pois: ProStagePoi[],
  departure: string | null = null,
  arrival: string | null = null,
): ElevationMarker[] {
  if (profile.length < 2) return [];
  const first = profile[0];
  const last = profile[profile.length - 1];

  const markers: ElevationMarker[] = [
    {
      kind: "start",
      km: first.distance,
      elevation: first.elevation,
      label: departure ?? "Start",
      badge: null,
      title: departure ? `Start · ${departure}` : "Start",
      level: 0,
    },
    {
      kind: "finish",
      km: last.distance,
      elevation: last.elevation,
      label: arrival ?? "Finish",
      badge: null,
      title: arrival ? `Finish · ${arrival}` : "Finish",
      level: 0,
    },
  ];

  for (const poi of pois) {
    const { point, distanceSquared } = nearestProfilePoint(
      profile,
      poi.lat,
      poi.lng,
    );
    if (distanceSquared > MAX_SNAP_METERS * MAX_SNAP_METERS) continue;
    markers.push({
      kind: poi.kind,
      km: point.distance,
      elevation: point.elevation,
      label: poi.name,
      badge: poi.kind === "kom" ? (poi.category ?? "C") : "S",
      title:
        poi.kind === "kom"
          ? komTitle(poi)
          : [poi.name, "Sprint", poi.km !== null ? `km ${poi.km}` : null]
              .filter(Boolean)
              .join(" · "),
      level: 0,
    });
  }

  markers.sort((a, b) => a.km - b.km);
  const minGapKm = (last.distance - first.distance) * 0.18;
  const lastKmPerRow = [-Infinity, -Infinity];
  for (const marker of markers) {
    let level = lastKmPerRow.findIndex((end) => marker.km - end >= minGapKm);
    if (level === -1) {
      level = lastKmPerRow[0] <= lastKmPerRow[1] ? 0 : 1;
    }
    marker.level = level;
    lastKmPerRow[level] = marker.km;
  }
  return markers;
}
