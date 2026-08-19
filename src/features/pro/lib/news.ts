import "server-only";

import type { AsoPublication } from "procycling-live/aso";
import type { ProNewsArticle } from "../types";
import { createLiveAsoClient } from "./clients";
import type { ProRaceConfig } from "./races";

/** Social embeds carry no readable body — keep only editorial items. */
const SKIPPED_TYPES = new Set(["twitter", "instagram", "fastory"]);

/** Cap for a single stage's newest-first feed. */
const MAX_STAGE_ARTICLES = 50;

/** Minimal entity decoding for the stripped paragraph text. */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'");
}

/** Strips ASO's paragraph HTML ("<br />" line breaks, tags) to plain text. */
function toPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim(),
  );
}

/**
 * Maps one raw ASO publication to a serializable article; null for social
 * embeds and title-less records.
 */
export function publicationToArticle(
  publication: AsoPublication,
  stageNumber: number,
): ProNewsArticle | null {
  if (SKIPPED_TYPES.has(publication.type ?? "")) return null;
  const title = publication.title?.trim();
  if (!title) return null;

  const raw = publication.text;
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const paragraphs = parts.map(toPlainText).filter((part) => part.length > 0);
  return {
    id: publication._id ?? `${stageNumber}-${title}`,
    title,
    paragraphs,
    stage: stageNumber,
    publishedAt: publication.publicationAt ?? null,
    pinned: publication.pinned === true,
  };
}

/** Sorts articles newest-first by publication time. */
export function sortArticles(articles: ProNewsArticle[]): ProNewsArticle[] {
  return articles.sort((a, b) => {
    const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bTime - aTime;
  });
}

/**
 * The race-center commentary feed for one stage, newest-first. Uses the
 * uncached client — during a live stage new entries appear every few minutes
 * and this feeds the stage page's live feed. Fails soft to an empty list.
 */
export async function fetchStageNews(
  race: ProRaceConfig,
  year: number,
  stageNumber: number,
): Promise<ProNewsArticle[]> {
  if (!race.asoRace) return [];
  try {
    const aso = createLiveAsoClient(race.asoRace, year);
    const publications = await aso.getPublications(stageNumber, "en");
    return sortArticles(
      publications
        .map((publication) => publicationToArticle(publication, stageNumber))
        .filter((article): article is ProNewsArticle => article !== null),
    ).slice(0, MAX_STAGE_ARTICLES);
  } catch {
    return [];
  }
}
