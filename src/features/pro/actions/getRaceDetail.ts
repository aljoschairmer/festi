"use server";

import { AsoClient } from "procycling-live/aso";
import { TissotClient } from "procycling-live/tissot";
import { getCurrentUser } from "@/features/auth/guards";
import { createAsoClient, createTissotClient } from "../lib/clients";
import {
  buildRiderPhotoIndex,
  buildRiderUciIndex,
  buildTeamImageIndex,
  lookupRiderPhoto,
  lookupTeamImages,
  type ProTeamImages,
  riderPhotoUrl,
  teamImages,
} from "../lib/images";
import { getProRace, type ProRaceConfig } from "../lib/races";
import type {
  ProRaceDetail,
  ProStage,
  ProStandingRow,
  ProStartlistTeam,
} from "../types";

async function fetchStages(
  race: ProRaceConfig,
  year: number,
): Promise<ProStage[]> {
  if (!race.asoRace) return [];
  try {
    const aso = createAsoClient(race.asoRace, year);
    const stages = await aso.getStages();
    return stages
      .map((stage, index) => ({
        number: stage.stage ?? stage.id ?? index + 1,
        date: stage.dateLocal ?? null,
        type: stage.type ?? null,
        departure: stage.departureCity?.label ?? null,
        arrival: stage.arrivalCity?.label ?? null,
        distanceKm: typeof stage.length === "number" ? stage.length : null,
      }))
      .sort((a, b) => a.number - b.number);
  } catch {
    return [];
  }
}

/**
 * Withdrawn riders, keyed by bib -> the stage they abandoned during. The
 * per-stage withdrawals binds embed classification records (their `rankings`
 * rows carry the bibs) alongside checkpoint noise, which is skipped. All
 * started stages are probed, today's included — mid-stage abandons count.
 */
async function fetchWithdrawnBibs(
  race: ProRaceConfig,
  year: number,
): Promise<Map<number, number>> {
  const withdrawn = new Map<number, number>();
  if (!race.asoRace) return withdrawn;
  try {
    const aso = createAsoClient(race.asoRace, year);
    const stages = await aso.getStages();
    const today = new Date().toISOString().slice(0, 10);
    const started = stages
      .map((stage) => ({
        number: stage.stage ?? stage.id,
        date: stage.dateLocal ?? null,
      }))
      .filter(
        (stage): stage is { number: number; date: string | null } =>
          typeof stage.number === "number",
      )
      .filter((stage) => stage.date !== null && stage.date <= today);

    const results = await Promise.allSettled(
      started.map(async (stage) => ({
        stage: stage.number,
        records: await aso.getWithdrawals(stage.number),
      })),
    );
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const record of result.value.records) {
        if (!Array.isArray(record.rankings)) continue;
        for (const row of record.rankings) {
          const bib =
            typeof row === "object" &&
            row !== null &&
            "bib" in row &&
            typeof row.bib === "number"
              ? row.bib
              : null;
          if (bib !== null && !withdrawn.has(bib)) {
            withdrawn.set(bib, result.value.stage);
          }
        }
      }
    }
  } catch {}
  return withdrawn;
}

async function fetchStartlist(
  race: ProRaceConfig,
  year: number,
  withdrawn: Map<number, number>,
): Promise<ProStartlistTeam[]> {
  if (!race.asoRace) return [];
  try {
    const aso = createAsoClient(race.asoRace, year);
    const [competitors, teams] = await Promise.all([
      aso.getRiders(),
      aso.getTeams(),
    ]);

    const byTeam = new Map<string, ProStartlistTeam>();
    for (const competitor of competitors) {
      const team = AsoClient.resolveRef(competitor.$team, teams);
      const teamName = team?.name ?? "Unknown team";
      let group = byTeam.get(teamName);
      if (!group) {
        const images = teamImages(team);
        group = {
          name: teamName,
          code: team?.code ?? null,
          riders: [],
          logoUrl: images.logoUrl,
          jerseyUrl: images.jerseyUrl,
          color: images.color,
        };
        byTeam.set(teamName, group);
      }
      const bib = competitor.bib ?? null;
      group.riders.push({
        bib,
        firstName: competitor.firstname ?? "",
        lastName: competitor.lastname ?? "",
        nationality: competitor.nationality?.toUpperCase() ?? null,
        photoUrl: riderPhotoUrl(competitor),
        withdrawnStage: bib !== null ? (withdrawn.get(bib) ?? null) : null,
      });
    }

    for (const group of byTeam.values()) {
      group.riders.sort((a, b) => (a.bib ?? 9999) - (b.bib ?? 9999));
    }
    return [...byTeam.values()].sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function fetchStandings(
  race: ProRaceConfig,
  year: number,
): Promise<ProStandingRow[]> {
  if (!race.tissotCode) return [];
  try {
    let teamImageIndex: Map<string, ProTeamImages> = new Map();
    let riderPhotoIndex = new Map<string, string>();
    let riderUciIndex = new Map<string, string>();
    if (race.asoRace) {
      try {
        const aso = createAsoClient(race.asoRace, year);
        const [teams, competitors] = await Promise.all([
          aso.getTeams(),
          aso.getRiders(),
        ]);
        teamImageIndex = buildTeamImageIndex(teams);
        riderPhotoIndex = buildRiderPhotoIndex(competitors);
        riderUciIndex = buildRiderUciIndex(competitors);
      } catch {}
    }

    const tissot = createTissotClient();
    const competitionId = TissotClient.competitionId(race.tissotCode, year);

    const latest = await tissot.getLatestOverallRanking(competitionId);
    const results = latest?.ranking.results ?? [];

    return results.map((row) => ({
      rank: typeof row.rank === "number" ? row.rank : null,
      rider: row.rider?.name ?? "Unknown rider",
      team: row.rider?.teamName ?? row.rider?.teamCode ?? null,
      nation: row.rider?.nation ?? null,
      time: row.value ?? null,
      gap: row.gap ?? null,
      teamLogoUrl:
        lookupTeamImages(
          teamImageIndex,
          row.rider?.teamCode ?? null,
          row.rider?.teamName ?? null,
        )?.logoUrl ?? null,
      riderPhotoUrl:
        (row.rider?.uciRiderId
          ? riderUciIndex.get(row.rider.uciRiderId)
          : undefined) ??
        lookupRiderPhoto(riderPhotoIndex, row.rider?.name ?? null),
    }));
  } catch {
    return [];
  }
}

/**
 * Race detail: stage program, startlist grouped by team, and overall
 * standings (when the race has a Tissot timing partner). Each section fails
 * soft independently so a single flaky upstream never breaks the page.
 * Returns null for unknown race keys.
 */
export async function getRaceDetail(
  raceKey: string,
  year: number,
): Promise<ProRaceDetail | null> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const race = getProRace(raceKey);
  if (!race) return null;

  const withdrawnPromise = fetchWithdrawnBibs(race, year);
  const [stages, startlist, standings] = await Promise.all([
    fetchStages(race, year),
    withdrawnPromise.then((withdrawn) => fetchStartlist(race, year, withdrawn)),
    fetchStandings(race, year),
  ]);

  return {
    key: race.key,
    name: race.name,
    year,
    stages,
    startlist,
    standings,
    hasStandingsSource: race.tissotCode !== null,
  };
}
