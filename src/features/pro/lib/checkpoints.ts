import "server-only";

import type { AsoCheckpoint } from "procycling-live/aso";
import type { ProLiveWeather, ProStagePoi } from "../types";

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Maps ASO course checkpoints to the points of interest we draw on the stage
 * map: KOM climbs (from the checkpoint's summit records, with category and
 * climb stats) and sprint points (from the checkpoint type markers).
 * Checkpoints without coordinates or POI markers are dropped.
 */
export function checkpointsToPois(checkpoints: AsoCheckpoint[]): ProStagePoi[] {
  const pois: ProStagePoi[] = [];
  for (const checkpoint of checkpoints) {
    const lat = asNumber(checkpoint.latitude);
    const lng = asNumber(checkpoint.longitude);
    if (lat === null || lng === null) continue;
    const km = asNumber(checkpoint.length);
    const place = asString(checkpoint.place);

    const summit = checkpoint.checkpointSummits?.[0];
    if (summit) {
      pois.push({
        kind: "kom",
        name: asString(summit.summit?.name) ?? place,
        km,
        lat,
        lng,
        category: asString(summit.code),
        climbLengthMeters: asNumber(summit.length),
        gradientPct: asNumber(summit.state),
      });
      continue;
    }

    const isSprint = checkpoint.checkpointTypes?.some((type) =>
      (type.type ?? type.code ?? "").toLowerCase().includes("sprint"),
    );
    if (isSprint) {
      pois.push({
        kind: "sprint",
        name: place,
        km,
        lat,
        lng,
        category: null,
        climbLengthMeters: null,
        gradientPct: null,
      });
    }
  }
  return pois.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
}

/**
 * Live weather from the checkpoint nearest to a position (typically the head
 * of the race), or null when no checkpoint carries a meteo record.
 */
export function nearestCheckpointWeather(
  checkpoints: AsoCheckpoint[],
  lat: number,
  lng: number,
): ProLiveWeather | null {
  let best: AsoCheckpoint | null = null;
  let bestDist = Infinity;
  for (const checkpoint of checkpoints) {
    if (!checkpoint.checkpointMeteo) continue;
    const cpLat = asNumber(checkpoint.latitude);
    const cpLng = asNumber(checkpoint.longitude);
    if (cpLat === null || cpLng === null) continue;
    const dist = (cpLat - lat) ** 2 + (cpLng - lng) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = checkpoint;
    }
  }
  const meteo = best?.checkpointMeteo;
  if (!best || !meteo) return null;
  return {
    temperatureC:
      typeof meteo.temperature === "number"
        ? Math.round(meteo.temperature)
        : null,

    windKph:
      typeof meteo.windForce === "number" ? Math.round(meteo.windForce) : null,
    windDirection: asString(meteo.windDirection),
    description: asString(meteo.currentWeatherDesc),
    place: asString(best.place),
  };
}
