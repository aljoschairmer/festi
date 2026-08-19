import type { MapDot } from "@/features/rides/types";
import type { ProJersey, ProLiveRider, ProStagePoi } from "../types";
import { formatGap } from "./format";

/** Dot fill colors per jersey; regular GPS-tracked riders are blue. */
export const JERSEY_COLORS: Record<ProJersey, string> = {
  yellow: "#facc15",
  green: "#16a34a",
  polka: "#ef4444",
  white: "#fafafa",
};

export const DEFAULT_RIDER_COLOR = "#3b82f6";

/** POI dot colors: KOM climbs echo the polka jersey, sprints the green one. */
export const KOM_COLOR = "#dc2626";
export const SPRINT_COLOR = "#16a34a";

/** Maps KOM/sprint POIs to map dots; rider dots (larger radius) draw on top. */
export function poisToDots(pois: ProStagePoi[]): MapDot[] {
  return pois.map((poi) => {
    const details =
      poi.kind === "kom"
        ? [
            poi.category ? `Cat. ${poi.category}` : null,
            poi.climbLengthMeters !== null
              ? `${(poi.climbLengthMeters / 1000).toFixed(1)} km climb`
              : null,
            poi.gradientPct !== null ? `${poi.gradientPct}%` : null,
          ]
        : ["Sprint", poi.km !== null ? `km ${poi.km}` : null];
    return {
      id: `${poi.kind}-${poi.km ?? poi.name}`,
      lat: poi.lat,
      lng: poi.lng,
      color: poi.kind === "kom" ? KOM_COLOR : SPRINT_COLOR,
      radius: 5,
      title: poi.name ?? (poi.kind === "kom" ? "Climb" : "Sprint"),
      subtitle: details.filter(Boolean).join(" · ") || undefined,
    };
  });
}

export const JERSEY_LABELS: Record<ProJersey, string> = {
  yellow: "Yellow jersey",
  green: "Green jersey",
  polka: "Polka dot jersey",
  white: "White jersey",
};

/** Maps rider telemetry to map dots, with jersey wearers highlighted. */
export function ridersToDots(riders: ProLiveRider[]): MapDot[] {
  return riders.map((rider) => {
    const details = [
      rider.team,
      rider.kph !== null ? `${rider.kph} km/h` : null,
      rider.secToFirstRider !== null && rider.secToFirstRider > 0
        ? formatGap(rider.secToFirstRider)
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const color = rider.jersey
      ? JERSEY_COLORS[rider.jersey]
      : (rider.teamColor ?? DEFAULT_RIDER_COLOR);
    return {
      id: rider.bib,
      lat: rider.lat,
      lng: rider.lng,
      color,

      stroke: rider.jersey === "white" ? "#525252" : undefined,

      radius: rider.jersey ? 10 : 6,
      title: rider.name ?? `Bib ${rider.bib}`,
      subtitle: details || undefined,
      imageUrl: rider.photoUrl ?? undefined,
    };
  });
}
