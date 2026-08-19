/**
 * Reverse geocoding: resolve a human-readable place/city name from coordinates.
 * Server-only helper (reads the MapTiler key), with a keyless OSM Nominatim
 * fallback. Prefers a city/town-level label over a full street address.
 */

import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

type MapTilerFeature = {
  text?: string;
  place_name?: string;
  place_type?: string[];
  context?: Array<{ id?: string; text?: string }>;
};

const CITY_TYPES = [
  "place",
  "municipality",
  "municipal_district",
  "locality",
  "joint_municipality",
];

function cityFromMapTiler(feature: MapTilerFeature | undefined): string | null {
  if (!feature) {
    return null;
  }

  const isCity =
    Array.isArray(feature.place_type) &&
    feature.place_type.some((type) => CITY_TYPES.includes(type));
  if (isCity) {
    return feature.text ?? feature.place_name ?? null;
  }

  const placeContext = feature.context?.find(
    (entry) =>
      typeof entry.id === "string" &&
      (entry.id.startsWith("place") || entry.id.startsWith("municipality")),
  );

  return placeContext?.text ?? feature.text ?? feature.place_name ?? null;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  const key = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;

  try {
    if (key) {
      const url = `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${key}&limit=1&language=en`;
      const response = await fetchWithTimeout(url, { cache: "no-store" });
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as { features?: MapTilerFeature[] };
      return cityFromMapTiler(data.features?.[0]);
    }

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2`;
    const response = await fetchWithTimeout(url, {
      cache: "no-store",
      headers: { "User-Agent": "FestiRidePlanner/1.0" },
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      address?: Record<string, string>;
      display_name?: string;
    };
    const address = data.address ?? {};
    return (
      address.city ??
      address.town ??
      address.village ??
      address.municipality ??
      address.county ??
      data.display_name ??
      null
    );
  } catch {
    return null;
  }
}
