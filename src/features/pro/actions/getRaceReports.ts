"use server";

import { TissotClient } from "procycling-live/tissot";
import { getCurrentUser } from "@/features/auth/guards";
import { createTissotClient } from "../lib/clients";
import { getProRace } from "../lib/races";
import type { ProStageReport } from "../types";

/**
 * Official Tissot report PDFs for every stage that has started, flattened into
 * one list (each entry carries its stage number). Empty when the race has no
 * timing partner or nothing is published yet; a flaky upstream fails soft to
 * an empty list.
 */
export async function getRaceReports(
  raceKey: string,
  year: number,
): Promise<ProStageReport[]> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const race = getProRace(raceKey);
  if (!race?.tissotCode) return [];

  try {
    const tissot = createTissotClient();
    const competitionId = TissotClient.competitionId(race.tissotCode, year);
    const schedule = await tissot.getSchedule(competitionId);
    if (schedule.stages.length === 0) return [];

    const now = Date.now();
    const offsetMs = (schedule.utcOffset ?? 0) * 3_600_000;
    const startedStages = schedule.stages

      .map((stage, index) => ({ stage, number: stage.phaseId ?? index + 1 }))
      .filter(({ stage }) => {
        const start = stage.date
          ? Date.parse(`${stage.date}Z`) - offsetMs
          : Number.NaN;
        return !Number.isNaN(start) && start <= now;
      });

    const results = await Promise.allSettled(
      startedStages.map(async ({ number }) => {
        const reports = await tissot.getReports(competitionId, number);
        return reports
          .filter(
            (report) =>
              typeof report.id === "string" && report.fileExists !== false,
          )
          .map(
            (report): ProStageReport => ({
              id: report.id as string,
              name: report.name ?? "Official report",
              stage: number,
            }),
          );
      }),
    );

    return results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
  } catch {
    return [];
  }
}
