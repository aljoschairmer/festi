import "server-only";

import {
  AsoClient,
  type AsoCompetitor,
  type AsoRanking,
  type AsoTeam,
  type AsoTelemetry,
  type AsoTelemetryRider,
  mapRankings,
} from "procycling-live/aso";
import type { TissotRanking } from "procycling-live/tissot";
import type {
  ProJersey,
  ProJerseyHolder,
  ProLiveInfo,
  ProLiveRider,
  ProStandingRow,
} from "../types";
import { riderPhotoUrl, teamImages } from "./images";

/** ASO's YGPW array order: [Yellow, Green, Polka, White]. */
const YGPW_ORDER: ProJersey[] = ["yellow", "green", "polka", "white"];

export type RiderIdentity = {
  name: string;
  team: string | null;
  /** Team accent color (hex), for coloring the live map dot. */
  teamColor: string | null;
  /** Rider head-shot URL, when available. */
  photoUrl: string | null;
};

/**
 * Joins the ASO startlist and teams into a bib -> identity lookup, used to
 * label the anonymous telemetry frames.
 */
export function buildRiderIndex(
  competitors: AsoCompetitor[],
  teams: AsoTeam[],
): Map<number, RiderIdentity> {
  const index = new Map<number, RiderIdentity>();
  for (const competitor of competitors) {
    if (!competitor.$team || typeof competitor.bib !== "number") continue;
    const team = AsoClient.resolveRef(competitor.$team, teams);
    const name = [competitor.firstname, competitor.lastname]
      .filter(Boolean)
      .join(" ");
    index.set(competitor.bib, {
      name: name || `Bib ${competitor.bib}`,
      team: team?.name ?? null,
      teamColor: teamImages(team).color,
      photoUrl: riderPhotoUrl(competitor),
    });
  }
  return index;
}

/**
 * Maps a raw telemetry frame into the serializable live payload: rider dots
 * (only entries with usable coordinates), jersey highlights from YGPW, and the
 * info-strip numbers taken from the head of the race.
 */
export function mapTelemetry(
  telemetry: AsoTelemetry,
  index: Map<number, RiderIdentity>,
): {
  riders: ProLiveRider[];
  info: ProLiveInfo | null;
  jerseyHolders: ProJerseyHolder[];
  updatedAt: number | null;
} {
  const jerseys = new Map<number, ProJersey>();
  const jerseyHolders: ProJerseyHolder[] = [];
  (telemetry.YGPW ?? []).forEach((bib, position) => {
    const jersey = YGPW_ORDER[position];
    if (typeof bib === "number" && jersey) {
      jerseys.set(bib, jersey);
      const identity = index.get(bib);
      if (identity) jerseyHolders.push({ jersey, rider: identity.name });
    }
  });

  const riders: ProLiveRider[] = [];
  for (const rider of telemetry.Riders ?? []) {
    if (
      typeof rider.Bib !== "number" ||
      typeof rider.Latitude !== "number" ||
      typeof rider.Longitude !== "number"
    ) {
      continue;
    }
    const identity = index.get(rider.Bib) ?? null;
    riders.push({
      bib: rider.Bib,
      lat: rider.Latitude,
      lng: rider.Longitude,
      name: identity?.name ?? null,
      team: identity?.team ?? null,
      jersey: jerseys.get(rider.Bib) ?? null,
      teamColor: identity?.teamColor ?? null,
      photoUrl: identity?.photoUrl ?? null,
      kph: typeof rider.kph === "number" ? Math.round(rider.kph) : null,
      kmToFinish:
        typeof rider.kmToFinish === "number"
          ? Math.round(rider.kmToFinish * 10) / 10
          : null,
      secToFirstRider:
        typeof rider.secToFirstRider === "number"
          ? Math.round(rider.secToFirstRider)
          : null,
    });
  }

  let head: AsoTelemetryRider | null = null;
  for (const rider of telemetry.Riders ?? []) {
    if (typeof rider.kmToFinish !== "number") continue;
    if (head === null || rider.kmToFinish < (head.kmToFinish ?? Infinity)) {
      head = rider;
    }
  }

  const info: ProLiveInfo | null = head
    ? {
        kmToFinish:
          typeof head.kmToFinish === "number"
            ? Math.round(head.kmToFinish * 10) / 10
            : null,
        speedKph: typeof head.kph === "number" ? Math.round(head.kph) : null,
        avgSpeedKph:
          typeof head.kphAvg === "number" ? Math.round(head.kphAvg) : null,
        temperatureC:
          typeof head.degC === "number" ? Math.round(head.degC) : null,
        gradientPct:
          typeof head.Gradient === "number"
            ? Math.round(head.Gradient * 10) / 10
            : null,
      }
    : null;

  return {
    riders,
    info,
    jerseyHolders,
    updatedAt:
      typeof telemetry._updatedAt === "number" ? telemetry._updatedAt : null,
  };
}

/**
 * Maps a Tissot live classification into standing rows, defending against the
 * same shape wobble as the race detail page's standings fetch.
 */
export function mapTissotRanking(ranking: TissotRanking): ProStandingRow[] {
  const results = ranking.results;
  if (!results || results.length === 0) return [];
  return results.map((row) => ({
    rank: typeof row.rank === "number" ? row.rank : null,
    rider: row.rider?.name ?? "Unknown rider",
    team: row.rider?.teamName ?? row.rider?.teamCode ?? null,
    nation: row.rider?.nation ?? null,
    time: typeof row.value === "string" ? row.value : null,
    gap: typeof row.gap === "string" ? row.gap : null,
    teamLogoUrl: null,
    riderPhotoUrl: null,
  }));
}

/**
 * Maps the heterogeneous ASO rankings bind into GC standing rows, using the
 * library's mapRankings() normalizer (it resolves $rider refs against the
 * startlist and formats time/gap). Picks the GC classification ("itg"),
 * falling back to the first one; photos come from the bib index.
 */
export function mapAsoGcRows(
  payload: AsoRanking | AsoRanking[] | null,
  competitors: AsoCompetitor[],
  teams: AsoTeam[],
  index: Map<number, RiderIdentity>,
): ProStandingRow[] {
  const classifications = mapRankings(payload, {
    riders: competitors,
    teams,
  });
  const gc =
    classifications.find((classification) => classification.type === "itg") ??
    classifications[0];
  if (!gc) return [];
  return gc.rows.slice(0, 30).map((row) => ({
    rank: row.rank ?? null,
    rider:
      row.name ?? (row.bib !== undefined ? `Bib ${row.bib}` : "Unknown rider"),
    team: row.team ?? null,
    nation: row.nation ? row.nation.toUpperCase() : null,
    time: row.time ?? null,
    gap: row.gap ?? null,
    teamLogoUrl: null,
    riderPhotoUrl:
      row.bib !== undefined ? (index.get(row.bib)?.photoUrl ?? null) : null,
  }));
}
