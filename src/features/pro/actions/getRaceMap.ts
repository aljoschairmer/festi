"use server";

import polyline from "@mapbox/polyline";
import { TissotClient } from "procycling-live/tissot";
import { getCurrentUser } from "@/features/auth/guards";
import {
  createAsoClient,
  createCyclingStageClient,
  createTissotClient,
} from "../lib/clients";
import { extractKml, parseKmlLines } from "../lib/kmz";
import { getProRace, type ProRaceConfig } from "../lib/races";
import type { ProRaceMap, ProRaceMapStage } from "../types";

/** Cap per stage line; ~20 stages stay well within an action payload. */
const MAX_POINTS_PER_STAGE = 250;
const EARTH_RADIUS_KM = 6371;

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

/** Haversine length of a `[lng, lat]` line, in km. */
function lineDistanceKm(points: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [lng1, lat1] = points[i - 1];
    const [lng2, lat2] = points[i];
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    total += 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
  }
  return total;
}

/** Reads a stage number out of a KML placemark name, when recognisable. */
function parseStageNumber(name: string | null): number | null {
  if (!name) return null;
  if (/prolog/i.test(name)) return 0;
  const match =
    name.match(/(?:stage|etappe|étape|etape)\s*0*(\d+)/i) ??
    name.match(/^0*(\d+)\b/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Stage lines from the official Tissot full-route KMZ, when the competition
 * publishes one. Null when there is no KMZ or it contains no line geometry.
 */
async function fetchKmzStages(
  race: ProRaceConfig,
  year: number,
): Promise<ProRaceMapStage[] | null> {
  if (!race.tissotCode) return null;
  const tissot = createTissotClient();
  const competitionId = TissotClient.competitionId(race.tissotCode, year);
  const competitions = await tissot.getCompetitions(year);
  const competition =
    competitions.find((entry) => entry.key === competitionId) ??
    competitions.find(
      (entry) =>
        typeof entry.key === "string" &&
        entry.key.startsWith(race.tissotCode as string) &&
        entry.year === year,
    );
  const routeUrl = competition?.routeUrl;
  if (typeof routeUrl !== "string" || routeUrl.length === 0) return null;

  const response = await fetch(routeUrl, { next: { revalidate: 3600 } });
  if (!response.ok) return null;
  const kml = extractKml(await response.arrayBuffer());
  if (!kml) return null;

  const stages = parseKmlLines(kml).map((line, index): ProRaceMapStage => {
    const sampled = downsample(line.points, MAX_POINTS_PER_STAGE);
    return {
      number: parseStageNumber(line.name),
      name: line.name ?? `Stage ${index + 1}`,
      geometry: polyline.encode(sampled.map(([lng, lat]) => [lat, lng])),
      distanceKm: Math.round(lineDistanceKm(line.points) * 10) / 10,
    };
  });
  return stages.length > 0 ? stages : null;
}

/**
 * Fallback: one line per stage from the cyclingstage GPX files (the same
 * source the stage detail pages use).
 */
async function fetchGpxStages(
  race: ProRaceConfig,
  year: number,
): Promise<ProRaceMapStage[]> {
  if (!race.cyclingstageSlug) return [];
  const cyclingstage = createCyclingStageClient();

  const toStage = (
    points: { lat: number; lon: number }[],
    distanceMeters: number,
    number: number | null,
    name: string,
  ): ProRaceMapStage => ({
    number,
    name,
    geometry: polyline.encode(
      downsample(points, MAX_POINTS_PER_STAGE).map((point) => [
        point.lat,
        point.lon,
      ]),
    ),
    distanceKm: Math.round(distanceMeters / 100) / 10,
  });

  if (race.oneDay) {
    const route = await cyclingstage.fetchOneDay(race.cyclingstageSlug, year);
    if (!route) return [];
    return [toStage(route.points, route.distanceMeters, null, race.name)];
  }

  const labels = new Map<number, string>();
  let numbers: number[] = [];
  if (race.asoRace) {
    try {
      const stages = await createAsoClient(race.asoRace, year).getStages();
      for (const stage of stages) {
        const number = stage.stage ?? stage.id;
        if (typeof number !== "number") continue;
        numbers.push(number);
        const base = number === 0 ? "Prologue" : `Stage ${number}`;
        labels.set(
          number,
          stage.departureCity?.label && stage.arrivalCity?.label
            ? `${base} · ${stage.departureCity.label} → ${stage.arrivalCity.label}`
            : base,
        );
      }
    } catch {}
  }
  if (numbers.length === 0) {
    numbers = Array.from({ length: 21 }, (_, index) => index + 1);
  }

  const results = await Promise.allSettled(
    numbers.map((number) =>
      cyclingstage.fetchStage(race.cyclingstageSlug as string, year, number),
    ),
  );
  const stages: ProRaceMapStage[] = [];
  results.forEach((result, index) => {
    if (result.status !== "fulfilled" || !result.value) return;
    const number = numbers[index];
    stages.push(
      toStage(
        result.value.route.points,
        result.value.route.distanceMeters,
        number,
        labels.get(number) ?? (number === 0 ? "Prologue" : `Stage ${number}`),
      ),
    );
  });
  return stages.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
}

function toRaceMap(
  stages: ProRaceMapStage[],
  source: ProRaceMap["source"],
): ProRaceMap {
  const distances = stages
    .map((stage) => stage.distanceKm)
    .filter((value): value is number => value !== null);
  return {
    source,
    stages,
    totalDistanceKm:
      distances.length > 0
        ? Math.round(distances.reduce((sum, value) => sum + value, 0))
        : null,
  };
}

/**
 * Overview map for the race detail page: every stage's route in one payload.
 * Prefers the official Tissot full-route KMZ; when that is missing (or is a
 * single undifferentiated line for a multi-stage race) it falls back to the
 * per-stage GPX files. Null when no geometry is available at all.
 */
export async function getRaceMap(
  raceKey: string,
  year: number,
): Promise<ProRaceMap | null> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const race = getProRace(raceKey);
  if (!race) return null;

  let kmzStages: ProRaceMapStage[] | null = null;
  try {
    kmzStages = await fetchKmzStages(race, year);
  } catch {
    kmzStages = null;
  }
  if (kmzStages && (race.oneDay || kmzStages.length >= 2)) {
    return toRaceMap(kmzStages, "tissot");
  }

  let gpxStages: ProRaceMapStage[] = [];
  try {
    gpxStages = await fetchGpxStages(race, year);
  } catch {
    gpxStages = [];
  }
  if (gpxStages.length > 0) return toRaceMap(gpxStages, "gpx");

  if (kmzStages && kmzStages.length > 0) return toRaceMap(kmzStages, "tissot");
  return null;
}
