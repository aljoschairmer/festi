import "server-only";

import type { AsoCompetitor, AsoTeam } from "procycling-live/aso";

/**
 * ASO's Racecenter records carry image URLs (team logos/jerseys, rider photos)
 * on their `img.aso.fr` CDN. This module reads them and joins teams/riders
 * onto the loosely-typed Tissot standings rows — teams by code and name,
 * riders by UCI licence code with a normalized-name fallback.
 */

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * ASO currently sends "#000000" for every team as an unset placeholder, which
 * would paint all map dots and card accents black. Treat pure black as "no
 * color" so callers fall back to their defaults; real colors pass through.
 */
function usableColor(value: unknown): string | null {
  const color = str(value);
  if (!color) return null;
  return /^#?0{3,6}$/i.test(color) ? null : color;
}

export type ProTeamImages = {
  logoUrl: string | null;
  jerseyUrl: string | null;
  color: string | null;
};

const EMPTY_TEAM_IMAGES: ProTeamImages = {
  logoUrl: null,
  jerseyUrl: null,
  color: null,
};

/** Team logo, kit jersey and accent color from an ASO team record. */
export function teamImages(team: AsoTeam | undefined): ProTeamImages {
  if (!team) return EMPTY_TEAM_IMAGES;
  return {
    logoUrl: str(team.logo) ?? str(team.logo_live),

    jerseyUrl: str(team.jersey_sm) ?? str(team.jersey),
    color: usableColor(team.color),
  };
}

/** Head-shot photo URL for a rider, preferring the smaller render. */
export function riderPhotoUrl(competitor: AsoCompetitor): string | null {
  return str(competitor.profile_sm) ?? str(competitor.profile);
}

/** Normalizes a rider name into a comparable key (A-Z0-9 only, order-free). */
function normalizeRiderName(value: string | null | undefined): string | null {
  if (!value) return null;

  const key = value
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .sort()
    .join("");
  return key.length > 0 ? key : null;
}

/**
 * Index of rider head-shots keyed by an order-free normalized name, so Tissot
 * standings rows (which carry "LASTNAME Firstname") can be matched back to the
 * ASO rider photo.
 */
export function buildRiderPhotoIndex(
  competitors: AsoCompetitor[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const competitor of competitors) {
    const photo = riderPhotoUrl(competitor);
    if (!photo) continue;
    const first = str(competitor.firstname) ?? "";
    const last = str(competitor.lastname) ?? "";
    const key = normalizeRiderName(`${first} ${last}`);
    if (key && !index.has(key)) index.set(key, photo);
  }
  return index;
}

/** Looks up a rider head-shot by name. */
export function lookupRiderPhoto(
  index: Map<string, string>,
  name: string | null,
): string | null {
  const key = normalizeRiderName(name);
  return key ? (index.get(key) ?? null) : null;
}

/**
 * Index of rider head-shots keyed by the 11-digit UCI licence code — the
 * canonical join key against Tissot data (`TissotRider.uciRiderId`), far more
 * robust than the name matching above.
 */
export function buildRiderUciIndex(
  competitors: AsoCompetitor[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const competitor of competitors) {
    const photo = riderPhotoUrl(competitor);
    const code = str(competitor.UCICode);
    if (photo && code && !index.has(code)) index.set(code, photo);
  }
  return index;
}

/** Normalizes a team code or name into a comparable key (A-Z0-9 only). */
export function normalizeTeamKey(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const key = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return key.length > 0 ? key : null;
}

/**
 * Index of team images keyed by both normalized code and normalized name, so
 * standings rows (which carry a Tissot team code/name) can be matched back to
 * the ASO team logo.
 */
export function buildTeamImageIndex(
  teams: AsoTeam[],
): Map<string, ProTeamImages> {
  const index = new Map<string, ProTeamImages>();
  for (const team of teams) {
    const images = teamImages(team);
    if (!images.logoUrl && !images.jerseyUrl && !images.color) continue;
    const code = normalizeTeamKey(team.code);
    const name = normalizeTeamKey(team.name);
    if (code && !index.has(code)) index.set(code, images);
    if (name && !index.has(name)) index.set(name, images);
  }
  return index;
}

/** Looks up team images by code first, then by name. */
export function lookupTeamImages(
  index: Map<string, ProTeamImages>,
  code: string | null,
  name: string | null,
): ProTeamImages | null {
  const byCode = normalizeTeamKey(code);
  if (byCode) {
    const hit = index.get(byCode);
    if (hit) return hit;
  }
  const byName = normalizeTeamKey(name);
  if (byName) {
    const hit = index.get(byName);
    if (hit) return hit;
  }
  return null;
}
