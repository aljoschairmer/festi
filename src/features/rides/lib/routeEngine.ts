import "server-only";

import polyline from "@mapbox/polyline";
import type { ElevationPoint, RouteResult } from "../types";

/**
 * Client for the Festi Route Engine — the self-hosted service that
 * generates roundtrips and point-to-point routes with preferences
 * (see the festi-backend repository). Generation is asynchronous:
 * submit a job, poll its status, fetch the result once SUCCEEDED.
 *
 * Results expire on the engine after a short TTL (~30 min), which is why
 * `createRide` re-fetches the result server-side at save time instead of
 * trusting client-supplied stats.
 */

export type EngineCategory = "road" | "gravel" | "mtb";
export type EngineDifficulty = "easy" | "moderate" | "hard";
export type EngineSurfacePreference = "paved" | "unpaved" | "mixed";

export type EngineGenerateRequest = {
  startLat: number;
  startLng: number;
  endLat?: number;
  endLng?: number;
  targetDistanceKm?: number;
  minDistanceKm?: number;
  maxDistanceKm?: number;
  targetElevationGainM?: number;
  /** Point-to-point only: max actual/direct distance ratio (1–3). */
  maxDetourFactor?: number;
  category: EngineCategory;
  difficulty?: EngineDifficulty;
  surfacePreference?: EngineSurfacePreference;
  avoid?: string[];
  preferScenic?: boolean;
  preferBikeNetworks?: boolean;
  maxSlopePercent?: number;
  startDirectionDeg?: number;
  averageSpeedKmh?: number;
  eBike?: boolean;
  viaPoints?: Array<{ lat: number; lng: number }>;
  numAlternatives?: number;
  seed?: number;
  locale?: "en" | "de";
};

export type EngineJobState =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export type EngineJobStatus = {
  jobId: string;
  state: EngineJobState;
  progressPercent: number;
  message: string;
  errorDetail?: string;
};

export type EngineHighlight = {
  name?: string;
  kind: string;
  lat: number;
  lng: number;
  distanceAlongRouteM: number;
};

export type EngineTurn = {
  text: string;
  streetName: string;
  distanceM: number;
  sign: number;
  pointIndex: number;
};

/** One forecast sample along the route, at the rider's ETA there. */
export type EngineWeatherSample = {
  lat: number;
  lng: number;
  distanceAlongRouteM: number;
  etaMinutes: number;
  time: string;
  temperatureC: number;
  windSpeedKmh: number;
  windGustsKmh: number;
  /** Direction the wind comes FROM (degrees, 0 = north). */
  windDirectionDeg: number;
  precipitationMm: number;
  precipitationProbability: number;
  /** WMO weather interpretation code (0 = clear … 99 = thunderstorm). */
  weatherCode: number;
};

export type EngineRouteWeather = {
  points: EngineWeatherSample[];
  summary: {
    temperatureMinC: number;
    temperatureMaxC: number;
    windAvgKmh: number;
    windMaxGustsKmh: number;
    dominantWindDirectionDeg: number;
    precipitationProbabilityMax: number;
    expectedPrecipitationMm: number;
    /** Distance shares [0..1] ridden against / with the wind. */
    headwindShare: number;
    tailwindShare: number;
  };
  /** Duration re-estimated with head-/tailwind along the route. */
  windAdjustedDurationMin: number;
  source: "open-meteo";
};

/** Engine route payload (only the fields Festi consumes). */
export type EngineRoute = {
  geojson: {
    geometry: { type: "LineString"; coordinates: number[][] };
  };
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  estimatedDurationMin: number;
  difficultyScore: number;
  unpavedRatio: number;
  surfaceBreakdown: Record<string, number>;
  wayTypeBreakdown: Record<string, number>;
  pushingSectionsM: number;
  highlights: EngineHighlight[];
  turns: EngineTurn[];
  mode: "roundtrip" | "point-to-point";
  detourFactor?: number;
  /** Ride-time forecast (absent when the weather source was unavailable). */
  weather?: EngineRouteWeather;
  warnings: string[];
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getRouteEngineBaseUrl(): string {
  return requireEnv("ROUTE_ENGINE_URL").replace(/\/$/, "");
}

function engineHeaders(userRef?: string, idempotencyKey?: string) {
  const apiKey = process.env.ROUTE_ENGINE_API_KEY;
  return {
    "content-type": "application/json",
    accept: "application/json",
    ...(apiKey ? { "x-api-key": apiKey } : {}),
    ...(userRef ? { "x-festi-user": userRef } : {}),
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}

/** Maps engine error responses to messages safe to show to users. */
async function toUserSafeError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (response.status === 400 && body.error?.includes("covered region")) {
    return new Error(
      "Route generation is not available for this area yet — it currently covers Germany.",
    );
  }
  if (response.status === 429) {
    return new Error(
      "You have too many route generations running. Please wait for them to finish.",
    );
  }
  if (response.status === 503) {
    return new Error(
      "The route generator is at capacity right now. Please try again in a moment.",
    );
  }
  if (response.status === 400 && body.error) {
    return new Error(body.error);
  }
  return new Error(
    "The route generator is unavailable. Please try again later.",
  );
}

/**
 * Submits a generation job. `userRef` feeds the engine's per-user quota;
 * `idempotencyKey` makes client retries safe (same key → same job).
 */
export async function submitGenerationJob(
  request: EngineGenerateRequest,
  userRef: string,
  idempotencyKey?: string,
): Promise<{ jobId: string }> {
  let response: Response;
  try {
    response = await fetch(`${getRouteEngineBaseUrl()}/v1/jobs`, {
      method: "POST",
      headers: engineHeaders(userRef, idempotencyKey),
      body: JSON.stringify(request),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "The route generator is unreachable. Please try again later.",
    );
  }
  if (!response.ok) throw await toUserSafeError(response);
  return (await response.json()) as { jobId: string };
}

/** Current job status; null when the job is unknown or expired. */
export async function getGenerationJobStatus(
  jobId: string,
): Promise<EngineJobStatus | null> {
  const response = await fetch(
    `${getRouteEngineBaseUrl()}/v1/jobs/${encodeURIComponent(jobId)}`,
    { headers: engineHeaders(), cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw await toUserSafeError(response);
  return (await response.json()) as EngineJobStatus;
}

/**
 * Routes of a SUCCEEDED job, best candidate first. Null when the job or
 * its result is gone (TTL) — callers should ask the user to regenerate.
 */
export async function getGenerationJobResult(
  jobId: string,
): Promise<EngineRoute[] | null> {
  const response = await fetch(
    `${getRouteEngineBaseUrl()}/v1/jobs/${encodeURIComponent(jobId)}/result`,
    { headers: engineHeaders(), cache: "no-store" },
  );
  if (response.status === 404 || response.status === 409) return null;
  if (!response.ok) throw await toUserSafeError(response);
  const payload = (await response.json()) as { routes: EngineRoute[] };
  return payload.routes;
}

/** Cancels a pending or running job. Best-effort: errors are swallowed. */
export async function cancelGenerationJob(jobId: string): Promise<void> {
  await fetch(
    `${getRouteEngineBaseUrl()}/v1/jobs/${encodeURIComponent(jobId)}`,
    {
      method: "DELETE",
      headers: engineHeaders(),
      cache: "no-store",
    },
  ).catch(() => {});
}

/** Great-circle distance in meters between two `[lng, lat]` points. */
function haversineMeters(a: number[], b: number[]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Builds the app's elevation profile (distance km + lat/lng per sample)
 * from the engine's `[lng, lat, ele]` geometry — the engine's own profile
 * lacks coordinates, which GPX export and map highlighting need.
 */
function buildElevationProfile(coordinates: number[][]): ElevationPoint[] {
  if (coordinates.length < 2) return [];
  const MAX_POINTS = 200;
  const step = Math.max(1, Math.ceil(coordinates.length / MAX_POINTS));
  const profile: ElevationPoint[] = [];
  let cumulative = 0;
  for (let i = 0; i < coordinates.length; i++) {
    if (i > 0)
      cumulative += haversineMeters(coordinates[i - 1], coordinates[i]);
    const ele = coordinates[i][2];
    if (typeof ele !== "number") continue;
    if (i % step === 0 || i === coordinates.length - 1) {
      profile.push({
        distance: Number((cumulative / 1000).toFixed(2)),
        elevation: Math.round(ele),
        lng: coordinates[i][0],
        lat: coordinates[i][1],
      });
    }
  }
  return profile;
}

/**
 * Samples evenly spaced waypoints along a route geometry (start, vias,
 * end). Handing a generated route to the planner this way makes it
 * editable exactly like a manually planned one: BRouter can reproduce
 * the tour through the vias, so dragging the line or moving a marker
 * recalculates a close variant instead of discarding the route.
 */
export function sampleRouteWaypoints(
  coordinates: number[][],
  viaCount = 8,
): Array<{ lat: number; lng: number }> {
  if (coordinates.length < 2) return [];

  const cumulative: number[] = [0];
  for (let i = 1; i < coordinates.length; i++) {
    cumulative.push(
      cumulative[i - 1] + haversineMeters(coordinates[i - 1], coordinates[i]),
    );
  }
  const total = cumulative[cumulative.length - 1];
  if (total === 0) return [];

  const toWaypoint = (c: number[]) => ({ lat: c[1], lng: c[0] });
  const waypoints = [toWaypoint(coordinates[0])];
  let cursor = 0;
  for (let via = 1; via <= viaCount; via++) {
    const targetM = (total * via) / (viaCount + 1);
    while (cursor < cumulative.length - 1 && cumulative[cursor] < targetM) {
      cursor++;
    }
    waypoints.push(toWaypoint(coordinates[cursor]));
  }
  waypoints.push(toWaypoint(coordinates[coordinates.length - 1]));
  return waypoints;
}

/**
 * Turns the engine's turn-by-turn instructions into named points along
 * the route: each instruction segment carries its street name, sampled
 * every few coordinates so every spot on the route has a named point
 * nearby. This is what lets the planner label waypoints "Hildesheimer
 * Straße" instead of "km 8.6" — with zero geocoding requests.
 */
export function buildStreetPoints(
  route: Pick<EngineRoute, "geojson" | "turns">,
  maxPoints = 400,
): Array<{ name: string; lat: number; lng: number }> {
  const coordinates = route.geojson.geometry.coordinates;
  const turns = [...route.turns].sort((a, b) => a.pointIndex - b.pointIndex);
  const points: Array<{ name: string; lat: number; lng: number }> = [];

  for (let t = 0; t < turns.length && points.length < maxPoints; t++) {
    const name = turns[t].streetName.trim();
    if (!name) continue;
    const from = Math.max(0, turns[t].pointIndex);
    const to = Math.min(
      coordinates.length - 1,
      turns[t + 1]?.pointIndex ?? coordinates.length - 1,
    );
    // Sample the segment sparsely — enough that any waypoint on it finds
    // a nearby named point, without ballooning the payload.
    const step = Math.max(1, Math.floor((to - from) / 4) || 1);
    for (let i = from; i <= to && points.length < maxPoints; i += step) {
      const c = coordinates[i];
      points.push({ name, lat: c[1], lng: c[0] });
    }
  }
  return points;
}

/**
 * Normalizes an engine route into the app's `RouteResult` shape:
 * km → meters, minutes → seconds, GeoJSON → encoded `[lat,lng]` polyline.
 */
export function toRouteResult(route: EngineRoute): RouteResult {
  const coordinates = route.geojson.geometry.coordinates.map(
    (c): [number, number] => [c[0], c[1]],
  );
  return {
    distance: Math.round(route.distanceKm * 1000),
    duration: route.estimatedDurationMin * 60,
    elevationGain: Math.round(route.elevationGainM),
    elevationLoss: Math.round(route.elevationLossM),
    routeGeometry: polyline.encode(coordinates.map(([lng, lat]) => [lat, lng])),
    coordinates,
    elevationProfile: buildElevationProfile(route.geojson.geometry.coordinates),
  };
}
