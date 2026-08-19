"use server";

import { TissotClient } from "procycling-live/tissot";
import { getCurrentUser } from "@/features/auth/guards";
import { checkpointsToPois } from "../lib/checkpoints";
import {
  createAsoClient,
  createCyclingStageClient,
  createTissotClient,
} from "../lib/clients";
import { fetchStageNews } from "../lib/news";
import { getProRace, type ProRaceConfig } from "../lib/races";
import { buildStageRoute } from "../lib/route";
import { buildTissotRoute } from "../lib/tissotRoute";
import type {
  ProStage,
  ProStageDetail,
  ProStagePoi,
  ProStageRoute,
} from "../types";

async function fetchStageInfo(
  race: ProRaceConfig,
  year: number,
  stageNumber: number,
): Promise<ProStage> {
  if (race.asoRace) {
    try {
      const aso = createAsoClient(race.asoRace, year);
      const stages = await aso.getStages();
      const match = stages.find(
        (stage) => (stage.stage ?? stage.id) === stageNumber,
      );
      if (match) {
        return {
          number: stageNumber,
          date: match.dateLocal ?? null,
          type: match.type ?? null,
          departure: match.departureCity?.label ?? null,
          arrival: match.arrivalCity?.label ?? null,
          distanceKm: typeof match.length === "number" ? match.length : null,
        };
      }
    } catch {}
  }
  return {
    number: stageNumber,
    date: null,
    type: null,
    departure: null,
    arrival: null,
    distanceKm: null,
  };
}

/**
 * Official route from Tissot: the per-stage KMZ supplies the map geometry and
 * the profile JSON the elevation. Returns null when the race has no timing
 * partner or the stage publishes no KMZ — used as the fallback when no
 * cyclingstage GPX is published.
 */
async function fetchTissotStageRoute(
  race: ProRaceConfig,
  year: number,
  stageNumber: number,
): Promise<ProStageRoute | null> {
  if (!race.tissotCode) return null;
  try {
    const tissot = createTissotClient();
    const competitionId = TissotClient.competitionId(race.tissotCode, year);
    const detail = await tissot.getStageDetail(competitionId, stageNumber);
    if (!detail?.mapUrl) return null;

    const [kmzResponse, profile] = await Promise.all([
      fetch(detail.mapUrl, { next: { revalidate: 3600 } }),
      tissot.getStageProfile(competitionId, stageNumber).catch(() => null),
    ]);
    if (!kmzResponse.ok) return null;
    return buildTissotRoute(
      await kmzResponse.arrayBuffer(),
      profile,
      detail.mapUrl,
    );
  } catch {
    return null;
  }
}

async function fetchStageRoute(
  race: ProRaceConfig,
  year: number,
  stageNumber: number,
): Promise<ProStageRoute | null> {
  if (race.cyclingstageSlug) {
    try {
      const cyclingstage = createCyclingStageClient();
      if (race.oneDay) {
        const route = await cyclingstage.fetchOneDay(
          race.cyclingstageSlug,
          year,
        );
        if (route) return buildStageRoute(route, null);
      } else {
        const result = await cyclingstage.fetchStage(
          race.cyclingstageSlug,
          year,
          stageNumber,
        );
        if (result) return buildStageRoute(result.route, result.url);
      }
    } catch {}
  }
  return fetchTissotStageRoute(race, year, stageNumber);
}

/**
 * KOM climbs and sprints along the stage, from the ASO checkpoint list
 * (slow-changing course data, so the cached client is fine).
 */
async function fetchStagePois(
  race: ProRaceConfig,
  year: number,
  stageNumber: number,
): Promise<ProStagePoi[]> {
  if (!race.asoRace) return [];
  try {
    const checkpoints = await createAsoClient(
      race.asoRace,
      year,
    ).getCheckpoints(stageNumber);
    return checkpointsToPois(checkpoints);
  } catch {
    return [];
  }
}

/**
 * Stage detail: basic stage info from ASO, the route (map geometry + elevation
 * profile) — cyclingstage GPX when available, official Tissot KMZ/profile as
 * fallback — and the course POIs (KOM/sprint) from the ASO checkpoints. The
 * route is null when no geometry is published for the stage. Returns null for
 * unknown race keys.
 */
export async function getStageDetail(
  raceKey: string,
  year: number,
  stageNumber: number,
): Promise<ProStageDetail | null> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const race = getProRace(raceKey);
  if (!race) return null;

  const [stage, route, pois, news] = await Promise.all([
    fetchStageInfo(race, year, stageNumber),
    fetchStageRoute(race, year, stageNumber),
    fetchStagePois(race, year, stageNumber),
    fetchStageNews(race, year, stageNumber),
  ]);

  return {
    raceKey: race.key,
    raceName: race.name,
    year,
    stage,
    route,
    pois,
    news,
  };
}
