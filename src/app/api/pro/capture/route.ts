import { NextResponse } from "next/server";
import {
  createAsoClient,
  createLiveAsoClient,
} from "@/features/pro/lib/clients";
import { buildRiderIndex, mapTelemetry } from "@/features/pro/lib/live";
import { PRO_RACES, type ProRaceConfig } from "@/features/pro/lib/races";
import { prisma } from "@/lib/prisma";

type CaptureResult = {
  raceKey: string;
  stage: number;
  riders: number;
  capturedAt: string;
};

/**
 * Captures one telemetry frame for a race, when it is racing today. Returns
 * null when the race has no stage today or the upstream reports no live data
 * (telemetry 204/null) — both are normal outside live windows.
 */
async function captureRace(
  race: ProRaceConfig,
  year: number,
  today: string,
): Promise<CaptureResult | null> {
  if (!race.asoRace) return null;

  const aso = createAsoClient(race.asoRace, year);
  const stages = await aso.getStages();
  const todayStage = stages.find((stage) => stage.dateLocal === today);
  if (!todayStage) return null;
  const stageNumber = todayStage.stage ?? todayStage.id;
  if (typeof stageNumber !== "number") return null;

  const telemetry = await createLiveAsoClient(
    race.asoRace,
    year,
  ).getTelemetryForStage(stageNumber);
  if (!telemetry) return null;

  const [competitors, teams] = await Promise.all([
    aso.getRiders(),
    aso.getTeams(),
  ]);
  const index = buildRiderIndex(competitors, teams);
  const { riders, updatedAt } = mapTelemetry(telemetry, index);
  if (riders.length === 0) return null;

  const capturedAt = updatedAt !== null ? new Date(updatedAt) : new Date();
  await prisma.proTelemetryFrame.createMany({
    data: [
      {
        raceKey: race.key,
        year,
        stage: stageNumber,
        capturedAt,
        payload: { riders },
      },
    ],
    skipDuplicates: true,
  });

  return {
    raceKey: race.key,
    stage: stageNumber,
    riders: riders.length,
    capturedAt: capturedAt.toISOString(),
  };
}

/**
 * Cron-driven telemetry capture: intended to be hit every ~30s during live
 * windows. Stores one frame per currently-live race; a race with no live
 * telemetry is skipped silently. Guarded by CRON_SECRET (Bearer token).
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Capture is not configured (CRON_SECRET is unset)." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const today = now.toISOString().slice(0, 10);

  const results = await Promise.allSettled(
    PRO_RACES.map((race) => captureRace(race, year, today)),
  );
  const captured = results
    .filter(
      (result): result is PromiseFulfilledResult<CaptureResult> =>
        result.status === "fulfilled" && result.value !== null,
    )
    .map((result) => result.value);

  return NextResponse.json({ captured });
}
