import "server-only";

import type { AsoCompetitor, AsoTeam, AsoTelemetry } from "procycling-live/aso";
import { TissotClient } from "procycling-live/tissot";
import type {
  ProLiveStageData,
  ProLiveWeather,
  ProStandingRow,
} from "../types";
import { nearestCheckpointWeather } from "./checkpoints";
import {
  createAsoClient,
  createLiveAsoClient,
  createLiveTissotClient,
} from "./clients";
import {
  buildRiderIndex,
  mapAsoGcRows,
  mapTelemetry,
  mapTissotRanking,
  type RiderIdentity,
} from "./live";
import { fetchStageNews } from "./news";
import type { ProRaceConfig } from "./races";

export const NOT_LIVE: ProLiveStageData = {
  live: false,
  updatedAt: null,
  riders: [],
  info: null,
  weather: null,
  jerseyHolders: [],
  ranking: [],
  rankingSource: null,
  news: [],
};

export type StartlistData = {
  competitors: AsoCompetitor[];
  teams: AsoTeam[];
  index: Map<number, RiderIdentity>;
};

const EMPTY_STARTLIST: StartlistData = {
  competitors: [],
  teams: [],
  index: new Map(),
};

/**
 * Startlist join data comes from the cached (1h) client on purpose — names and
 * teams don't change mid-stage, so only the telemetry/rankings themselves need
 * to bypass the cache.
 */
export async function fetchStartlist(
  race: ProRaceConfig,
  year: number,
): Promise<StartlistData> {
  if (!race.asoRace) return EMPTY_STARTLIST;
  try {
    const aso = createAsoClient(race.asoRace, year);
    const [competitors, teams] = await Promise.all([
      aso.getRiders(),
      aso.getTeams(),
    ]);
    return { competitors, teams, index: buildRiderIndex(competitors, teams) };
  } catch {
    return EMPTY_STARTLIST;
  }
}

/** Live classification: prefer Tissot when available, fall back to ASO. */
async function fetchLiveRanking(
  race: ProRaceConfig,
  year: number,
  stageNumber: number,
  startlist: StartlistData,
): Promise<{ ranking: ProStandingRow[]; source: "tissot" | "aso" | null }> {
  if (race.tissotCode) {
    try {
      const tissot = createLiveTissotClient();
      const competitionId = TissotClient.competitionId(race.tissotCode, year);
      const live = await tissot.getLiveRankings(competitionId, stageNumber);
      if (live) {
        const ranking = mapTissotRanking(live);
        if (ranking.length > 0) return { ranking, source: "tissot" };
      }
    } catch {}
  }
  if (race.asoRace) {
    try {
      const aso = createLiveAsoClient(race.asoRace, year);
      const payload = await aso.getRankings(stageNumber);
      const ranking = mapAsoGcRows(
        payload,
        startlist.competitors,
        startlist.teams,
        startlist.index,
      );
      if (ranking.length > 0) return { ranking, source: "aso" };
    } catch {}
  }
  return { ranking: [], source: null };
}

/**
 * Weather near the head of the race: the meteo record of the course checkpoint
 * closest to the leading GPS-tracked rider. Checkpoints are slow-changing
 * course data, so the cached client is fine; the meteo record itself is
 * updated upstream inside the same payload.
 */
async function fetchHeadWeather(
  race: ProRaceConfig,
  year: number,
  stageNumber: number,
  riders: ProLiveStageData["riders"],
): Promise<ProLiveWeather | null> {
  if (!race.asoRace) return null;
  const head = riders.reduce<(typeof riders)[number] | null>(
    (best, rider) =>
      rider.kmToFinish !== null &&
      (best === null || rider.kmToFinish < (best.kmToFinish ?? Infinity))
        ? rider
        : best,
    null,
  );
  if (!head) return null;
  try {
    const checkpoints = await createAsoClient(
      race.asoRace,
      year,
    ).getCheckpoints(stageNumber);
    return nearestCheckpointWeather(checkpoints, head.lat, head.lng);
  } catch {
    return null;
  }
}

/**
 * One full live snapshot for a stage: rider GPS positions joined against the
 * startlist, info-strip numbers, and the current live classification. Returns
 * `live: false` when ASO reports no live racing (telemetry 204/null) — the
 * normal state outside stage hours. Shared by the SSE route handler (initial
 * snapshot + slow-lane refresh) so both paths serve the identical shape.
 *
 * Pass a pre-fetched `startlist` when calling repeatedly (the SSE stream keeps
 * one for its whole lifetime) to skip the redundant lookup.
 */
export async function buildLiveStageData(
  race: ProRaceConfig,
  year: number,
  stageNumber: number,
  startlist?: StartlistData,
): Promise<ProLiveStageData> {
  if (!race.asoRace) return NOT_LIVE;

  let telemetry: AsoTelemetry | null;
  try {
    telemetry = await createLiveAsoClient(
      race.asoRace,
      year,
    ).getTelemetryForStage(stageNumber);
  } catch {
    return NOT_LIVE;
  }
  if (!telemetry) return NOT_LIVE;

  const resolvedStartlist = startlist ?? (await fetchStartlist(race, year));
  const { riders, info, jerseyHolders, updatedAt } = mapTelemetry(
    telemetry,
    resolvedStartlist.index,
  );

  if (riders.length === 0) return NOT_LIVE;

  const [{ ranking, source }, weather, news] = await Promise.all([
    fetchLiveRanking(race, year, stageNumber, resolvedStartlist),
    fetchHeadWeather(race, year, stageNumber, riders),
    fetchStageNews(race, year, stageNumber),
  ]);

  return {
    live: true,
    updatedAt,
    riders,
    info,
    weather,
    jerseyHolders,
    ranking,
    rankingSource: source,
    news,
  };
}
