import "server-only";

import polyline from "@mapbox/polyline";
import type { TissotStageProfile } from "procycling-live/tissot";
import type { ElevationPoint, Waypoint } from "@/features/rides/types";
import type { ProStageRoute } from "../types";
import { extractKml, parseKmlLines } from "./kmz";

/** Cap for the encoded map geometry; keeps the action payload small. */
const MAX_GEOMETRY_POINTS = 800;
/** Cap for the elevation chart, matching the rides feature's profile size. */
const MAX_PROFILE_POINTS = 200;
const EARTH_RADIUS_METERS = 6_371_000;

/** Picks evenly spaced points, always keeping the first and the last. */
function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const sampled = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (last !== undefined && sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return sampled;
}

/** Haversine distance between two `[lng, lat]` pairs, in meters. */
function distanceMeters(a: [number, number], b: [number, number]): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/** Cumulative distances (meters) along a `[lng, lat]` line. */
function cumulativeDistances(points: [number, number][]): number[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(
      cumulative[i - 1] + distanceMeters(points[i - 1], points[i]),
    );
  }
  return cumulative;
}

/** Interpolated `[lng, lat]` at a given distance (meters) along the line. */
function positionAt(
  points: [number, number][],
  cumulative: number[],
  distance: number,
): [number, number] {
  if (distance <= 0) return points[0];
  const total = cumulative[cumulative.length - 1];
  if (distance >= total) return points[points.length - 1];
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < distance) i++;
  const segmentStart = cumulative[i - 1];
  const segmentLength = cumulative[i] - segmentStart;
  const t = segmentLength > 0 ? (distance - segmentStart) / segmentLength : 0;
  const [lng1, lat1] = points[i - 1];
  const [lng2, lat2] = points[i];
  return [lng1 + (lng2 - lng1) * t, lat1 + (lat2 - lat1) * t];
}

/**
 * Turns Tissot's per-stage route data into the same payload the cyclingstage
 * GPX path produces: the stage KMZ supplies the map geometry, the profile
 * JSON the elevation. Profile points carry only a distance (in **meters**,
 * despite the upstream docs saying km), so each profile point is interpolated
 * onto the KMZ line to recover lat/lng for the map-hover sync. Returns null
 * when the KMZ contains no usable line geometry.
 */
export function buildTissotRoute(
  kmz: ArrayBuffer,
  profile: TissotStageProfile | null,
  sourceUrl: string | null,
): ProStageRoute | null {
  const kml = extractKml(kmz);
  if (!kml) return null;

  const line = parseKmlLines(kml)
    .map((entry) => entry.points)
    .sort((a, b) => b.length - a.length)[0];
  if (!line || line.length < 2) return null;

  const routeGeometry = polyline.encode(
    downsample(line, MAX_GEOMETRY_POINTS).map(([lng, lat]) => [lat, lng]),
  );
  const first = line[0];
  const last = line[line.length - 1];
  const waypoints: Waypoint[] = [
    { lat: first[1], lng: first[0] },
    { lat: last[1], lng: last[0] },
  ];

  const cumulative = cumulativeDistances(line);
  const lineDistance = cumulative[cumulative.length - 1];

  const profilePoints = (profile?.points ?? []).filter(
    (point) =>
      typeof point.distance === "number" && typeof point.elevation === "number",
  );
  const elevationProfile: ElevationPoint[] = downsample(
    profilePoints,
    MAX_PROFILE_POINTS,
  ).map((point) => {
    const [lng, lat] = positionAt(line, cumulative, point.distance as number);
    return {
      distance: Number(((point.distance as number) / 1000).toFixed(2)),
      elevation: Math.round(point.elevation as number),
      lat,
      lng,
    };
  });

  let elevationGain = 0;
  let elevationLoss = 0;
  for (let i = 1; i < profilePoints.length; i++) {
    const delta =
      (profilePoints[i].elevation as number) -
      (profilePoints[i - 1].elevation as number);
    if (delta > 0) elevationGain += delta;
    else elevationLoss -= delta;
  }

  const profileDistance =
    profilePoints.length > 0
      ? (profilePoints[profilePoints.length - 1].distance as number)
      : 0;

  return {
    routeGeometry,
    waypoints,
    elevationProfile,
    distanceMeters: Math.round(Math.max(lineDistance, profileDistance)),
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
    minEle: profile?.settings?.min ?? null,
    maxEle: profile?.settings?.max ?? null,
    sourceUrl,
  };
}
