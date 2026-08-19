import { NextResponse } from "next/server";
import type { AsoTelemetry } from "procycling-live/aso";
import { getCurrentUser } from "@/features/auth/guards";
import { createLiveAsoClient } from "@/features/pro/lib/clients";
import { mapTelemetry } from "@/features/pro/lib/live";
import {
  buildLiveStageData,
  fetchStartlist,
} from "@/features/pro/lib/liveStage";
import { fetchStageNews } from "@/features/pro/lib/news";
import { getProRace } from "@/features/pro/lib/races";
import type { ProLiveStageData } from "@/features/pro/types";

/** Comment frames keep intermediaries from reaping an idle connection. */
const HEARTBEAT_MS = 20_000;
/**
 * Slow lane: full snapshot rebuild (telemetry + rankings + weather). Also the
 * liveness check — it flips the panel to live before the first telemetry push
 * and back to not-live after the stage ends.
 */
const REFRESH_MS = 30_000;
/** Upstream reconnect backoff, and the retry hint sent to EventSource. */
const RECONNECT_DELAY_MS = 5_000;

/** Abort-aware sleep: resolves early (never rejects) when the signal fires. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}

/**
 * SSE stream of live stage snapshots from two lanes: ASO's own telemetry
 * push, and a full rebuild every {@link REFRESH_MS} for rankings, weather
 * and live-status changes. Every event carries a complete snapshot.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/pro/live/[race]/[year]/[stage]">,
) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  const params = await ctx.params;
  const race = getProRace(params.race);
  const year = Number(params.year);
  const stageNumber = Number(params.stage);
  if (
    !race?.asoRace ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    !Number.isInteger(stageNumber) ||
    stageNumber < 1 ||
    stageNumber > 30
  ) {
    return NextResponse.json({ error: "Unknown stage." }, { status: 404 });
  }
  const asoRace = race.asoRace;

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (frame: string) => {
        if (abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          abort.abort();
        }
      };
      const send = (snapshot: ProLiveStageData) =>
        write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

      const heartbeat = setInterval(
        () => write(": heartbeat\n\n"),
        HEARTBEAT_MS,
      );
      abort.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {}
      });

      const run = async () => {
        write(`retry: ${RECONNECT_DELAY_MS}\n\n`);

        const startlist = await fetchStartlist(race, year);
        let latest = await buildLiveStageData(
          race,
          year,
          stageNumber,
          startlist,
        );
        if (abort.signal.aborted) return;
        send(latest);

        const slowLane = (async () => {
          while (!abort.signal.aborted) {
            await sleep(REFRESH_MS, abort.signal);
            if (abort.signal.aborted) return;
            try {
              const next = await buildLiveStageData(
                race,
                year,
                stageNumber,
                startlist,
              );

              latest =
                next.live &&
                latest.live &&
                (latest.updatedAt ?? 0) > (next.updatedAt ?? 0)
                  ? {
                      ...next,
                      riders: latest.riders,
                      info: latest.info,
                      jerseyHolders: latest.jerseyHolders,
                      updatedAt: latest.updatedAt,
                    }
                  : next;
              send(latest);
            } catch {}
          }
        })();

        const aso = createLiveAsoClient(asoRace, year);
        const telemetryBind = `telemetryCompetitor-${year}`;
        const newsBind = `publication_en-${year}-${stageNumber}`;
        let newsRefreshing = false;
        while (!abort.signal.aborted) {
          try {
            for await (const update of aso.streamLive(abort.signal)) {
              if (update?.bind === newsBind) {
                if (!newsRefreshing) {
                  newsRefreshing = true;
                  void fetchStageNews(race, year, stageNumber)
                    .then((news) => {
                      if (abort.signal.aborted) return;
                      latest = { ...latest, news };
                      send(latest);
                    })
                    .catch(() => {})
                    .finally(() => {
                      newsRefreshing = false;
                    });
                }
                continue;
              }

              if (update?.bind !== telemetryBind) continue;
              const frame = update.data as AsoTelemetry | undefined;
              if (!frame || frame.StageIndex !== stageNumber) continue;
              const mapped = mapTelemetry(frame, startlist.index);
              if (mapped.riders.length === 0) continue;

              if (
                latest.live &&
                mapped.updatedAt !== null &&
                latest.updatedAt !== null &&
                mapped.updatedAt <= latest.updatedAt
              ) {
                continue;
              }
              latest = { ...latest, live: true, ...mapped };
              send(latest);
            }
          } catch {}
          if (!abort.signal.aborted) {
            await sleep(RECONNECT_DELAY_MS, abort.signal);
          }
        }
        await slowLane;
      };

      void run()
        .catch(() => {})
        .finally(() => abort.abort());
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",

      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
