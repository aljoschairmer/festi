import "server-only";

import type { NewsArticle } from "../types";

/**
 * Free, key-less cycling news via public RSS feeds. We parse the XML with
 * regex (no DOM / XML libs) so this runs on the Cloudflare Workers runtime.
 */
const FEEDS: { url: string; source: string }[] = [
  { url: "https://www.cyclingnews.com/rss/", source: "Cyclingnews" },
  { url: "https://road.cc/rss", source: "road.cc" },
  { url: "https://cyclingmagazine.ca/feed/", source: "Cycling Magazine" },
];

/** Pulls the first capture group of `regex` from `xml`, or null. */
function match(xml: string, regex: RegExp): string | null {
  const m = regex.exec(xml);
  return m?.[1]?.trim() ?? null;
}

/** Unwraps CDATA and decodes the handful of entities we care about. */
function clean(value: string | null): string {
  if (!value) return "";
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImage(itemXml: string): string | null {
  const url =
    match(itemXml, /<media:content[^>]*url="([^"]+)"/i) ??
    match(itemXml, /<media:thumbnail[^>]*url="([^"]+)"/i) ??
    match(itemXml, /<enclosure[^>]*url="([^"]+)"[^>]*type="image/i) ??
    match(
      itemXml,
      /<enclosure[^>]*url="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
    ) ??
    match(itemXml, /<img[^>]*src="([^"]+)"/i);
  return url ?? null;
}

function parseFeed(xml: string, source: string): NewsArticle[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const articles: NewsArticle[] = [];

  for (const item of items) {
    const title = clean(match(item, /<title>([\s\S]*?)<\/title>/i));
    const link =
      match(item, /<link>([\s\S]*?)<\/link>/i) ??
      match(item, /<link[^>]*href="([^"]+)"/i);
    if (!title || !link) continue;

    const pubDate = match(item, /<pubDate>([\s\S]*?)<\/pubDate>/i);
    const description = clean(
      match(item, /<description>([\s\S]*?)<\/description>/i),
    );
    const published = pubDate ? new Date(pubDate) : null;

    articles.push({
      id: link,
      title,
      link: link.trim(),
      source,
      publishedAt:
        published && !Number.isNaN(published.getTime())
          ? published.toISOString()
          : null,
      image: extractImage(item),
      excerpt: description.slice(0, 220),
    });
  }

  return articles;
}

/** Fetches and merges all cycling feeds, newest first. Cached for 30 min. */
export async function fetchCyclingNews(): Promise<NewsArticle[]> {
  const results = await Promise.allSettled(
    FEEDS.map(async ({ url, source }) => {
      const res = await fetch(url, {
        headers: { "User-Agent": "FestiBot/1.0 (+https://festi.app)" },
        next: { revalidate: 1800 },
      });
      if (!res.ok) return [];
      const xml = await res.text();
      return parseFeed(xml, source);
    }),
  );

  const articles = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );

  const seen = new Set<string>();
  const unique = articles.filter((a) => {
    if (seen.has(a.link)) return false;
    seen.add(a.link);
    return true;
  });

  unique.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });

  return unique.filter((a) => !!a.image).slice(0, 60);
}
