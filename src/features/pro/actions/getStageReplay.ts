"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { prisma } from "@/lib/prisma";
import { getProRace } from "../lib/races";
import type { ProLiveRider, ProReplayFrame, ProStageReplay } from "../types";

/** Cap on frames sent to the client; a full stage at 30s cadence is ~600. */
const MAX_FRAMES = 240;

/** Picks evenly spaced frames, always keeping the first and the last. */
function downsampleFrames(frames: ProReplayFrame[]): ProReplayFrame[] {
  if (frames.length <= MAX_FRAMES) return frames;
  const step = Math.ceil(frames.length / MAX_FRAMES);
  const sampled = frames.filter((_, index) => index % step === 0);
  const last = frames[frames.length - 1];
  if (last && sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

/** Defensive read of the stored frame payload ({ riders: ProLiveRider[] }). */
function parseRiders(payload: unknown): ProLiveRider[] {
  if (typeof payload !== "object" || payload === null) return [];
  const riders = (payload as { riders?: unknown }).riders;
  if (!Array.isArray(riders)) return [];
  return riders.filter(
    (rider): rider is ProLiveRider =>
      typeof rider === "object" &&
      rider !== null &&
      typeof (rider as ProLiveRider).bib === "number" &&
      typeof (rider as ProLiveRider).lat === "number" &&
      typeof (rider as ProLiveRider).lng === "number",
  );
}

/**
 * Captured telemetry frames for a past stage, in chronological order and
 * downsampled to a client-friendly size. Empty when the stage was never
 * captured (frames only exist where the capture cron ran during the stage).
 */
/** Hard cap: a long stage at 30s cadence is ~600 frames. */
const MAX_REPLAY_FRAMES = 1200;

export async function getStageReplay(
  raceKey: string,
  year: number,
  stageNumber: number,
): Promise<ProStageReplay> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("You must be signed in.");
  }

  const race = getProRace(raceKey);
  if (!race) return { frames: [] };

  try {
    const rows = await prisma.proTelemetryFrame.findMany({
      take: MAX_REPLAY_FRAMES,
      where: { raceKey: race.key, year, stage: stageNumber },
      orderBy: { capturedAt: "asc" },
      select: { capturedAt: true, payload: true },
    });

    const frames = rows
      .map((row) => ({
        capturedAt: row.capturedAt.getTime(),
        riders: parseRiders(row.payload),
      }))
      .filter((frame) => frame.riders.length > 0);

    return { frames: downsampleFrames(frames) };
  } catch {
    return { frames: [] };
  }
}
