"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { createAsoClient } from "../lib/clients";
import { teamImages } from "../lib/images";
import { PRO_RACES, type ProRaceConfig } from "../lib/races";
import type { ProRaceStatus, ProRaceSummary } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

function deriveStatus(
  startDate: string | null,
  endDate: string | null,
): ProRaceStatus {
  if (!startDate || !endDate) return "unknown";
  const now = Date.now();
  if (now < Date.parse(startDate)) return "upcoming";

  if (now > Date.parse(endDate) + DAY_MS) return "finished";
  return "live";
}

async function summarizeRace(
  race: ProRaceConfig,
  year: number,
): Promise<ProRaceSummary> {
  if (!race.asoRace) throw new Error("No ASO source configured.");
  const aso = createAsoClient(race.asoRace, year);

  const [stages, teams] = await Promise.all([
    aso.getStages(),
    aso.getTeams().catch(() => []),
  ]);
  const dates = stages
    .map((stage) => stage.dateLocal ?? null)
    .filter((date): date is string => date !== null)
    .sort();
  const startDate = dates[0] ?? null;
  const endDate = dates[dates.length - 1] ?? null;
  const teamLogos = teams
    .map((team) => teamImages(team).logoUrl)
    .filter((url): url is string => url !== null);
  return {
    key: race.key,
    name: race.name,
    year,
    status: deriveStatus(startDate, endDate),
    startDate,
    endDate,
    stageCount: stages.length > 0 ? stages.length : null,
    teamLogos,
  };
}

/**
 * Hub data: one summary per curated race for the current season. A race whose
 * upstream fetch fails degrades to an "unknown" card instead of failing the
 * whole page.
 */
export async function getProRaces(): Promise<ProRaceSummary[]> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const year = new Date().getUTCFullYear();
  const results = await Promise.allSettled(
    PRO_RACES.map((race) => summarizeRace(race, year)),
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const race = PRO_RACES[index];
    return {
      key: race?.key ?? `race-${index}`,
      name: race?.name ?? "Unknown race",
      year,
      status: "unknown",
      startDate: null,
      endDate: null,
      stageCount: null,
      teamLogos: [],
    };
  });
}
