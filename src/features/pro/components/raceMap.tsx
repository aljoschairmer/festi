"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type {
  GeoJSONSource,
  MapLayerMouseEvent,
  Map as MapLibreMap,
  Marker,
} from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeRouteGeometry } from "@/features/rides/lib/geometry";
import { getMapStyle } from "@/features/rides/lib/mapStyle";
import { guardTerrainSource } from "@/features/rides/lib/terrain";
import { cn } from "@/lib/utils";
import type { ProRaceMapStage } from "../types";

const STAGES_SOURCE_ID = "race-stages";
const STAGES_LAYER_ID = "race-stages-lines";
const STAGES_HIT_LAYER_ID = "race-stages-hit";

/** Distinct stage colors that read well on the dark basemap, cycled. */
const STAGE_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
];

type RaceMapProps = {
  stages: ProRaceMapStage[];
  raceKey: string;
  year: number;
  className?: string;
};

type DecodedStage = ProRaceMapStage & {
  coordinates: [number, number][];
  color: string;
};

/**
 * Overview map of a whole race: one colored line per stage with hover info
 * (stage name and length) and numbered start markers. Clicking a stage line
 * or marker navigates to that stage's detail page.
 */
export function RaceMap({ stages, raceKey, year, className }: RaceMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const decoded = useMemo<DecodedStage[]>(
    () =>
      stages.map((stage, index) => ({
        ...stage,
        coordinates: decodeRouteGeometry(stage.geometry),
        color: STAGE_COLORS[index % STAGE_COLORS.length],
      })),
    [stages],
  );
  const decodedRef = useRef(decoded);
  useEffect(() => {
    decodedRef.current = decoded;
  }, [decoded]);

  const stageHref = (number: number | null) =>
    number !== null
      ? `/dashboard/pro/${raceKey}/${year}/stage/${number}`
      : null;
  const stageHrefRef = useRef(stageHref);
  useEffect(() => {
    stageHrefRef.current = stageHref;
  });

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current) return;

    let map: MapLibreMap | null = null;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    void (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style: getMapStyle(),
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      guardTerrainSource(map);
      map.addControl(new maplibregl.NavigationControl(), "top-right");

      const observedMap = map;
      resizeObserver = new ResizeObserver(() => observedMap.resize());
      resizeObserver.observe(containerRef.current);

      map.on("load", () => {
        if (!map) return;
        map.addSource(STAGES_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: STAGES_LAYER_ID,
          type: "line",
          source: STAGES_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 3,
            "line-opacity": 0.85,
          },
        });
        // Wide invisible twin so the thin lines are easy to hover/tap.
        map.addLayer({
          id: STAGES_HIT_LAYER_ID,
          type: "line",
          source: STAGES_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#000000",
            "line-width": 18,
            "line-opacity": 0,
          },
        });

        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 10,
        });
        const showPopup = (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          if (!feature || !map) return;
          const props = feature.properties as {
            name?: string;
            distanceKm?: number;
          };
          if (!props?.name) return;
          const content = document.createElement("div");
          content.className = "text-xs text-neutral-900";
          const title = document.createElement("div");
          title.className = "font-semibold";
          title.textContent = props.name;
          content.appendChild(title);
          if (typeof props.distanceKm === "number") {
            const subtitle = document.createElement("div");
            subtitle.className = "text-neutral-500";
            subtitle.textContent = `${props.distanceKm} km`;
            content.appendChild(subtitle);
          }
          popup.setLngLat(event.lngLat).setDOMContent(content).addTo(map);
        };
        map.on("mouseenter", STAGES_HIT_LAYER_ID, (event) => {
          if (map) map.getCanvas().style.cursor = "pointer";
          showPopup(event);
        });
        map.on("mousemove", STAGES_HIT_LAYER_ID, showPopup);
        map.on("mouseleave", STAGES_HIT_LAYER_ID, () => {
          if (map) map.getCanvas().style.cursor = "";
          popup.remove();
        });
        map.on("click", STAGES_HIT_LAYER_ID, (event) => {
          const index = event.features?.[0]?.properties?.index;
          const stage =
            typeof index === "number" ? decodedRef.current[index] : undefined;
          const href = stage ? stageHrefRef.current(stage.number) : null;
          if (href) router.push(href);
        });

        setReady(true);
        map.resize();
      });
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [router]);

  // Render the stage lines, numbered start markers, and fit the view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const source = map.getSource(STAGES_SOURCE_ID);
    if (source && "setData" in source) {
      (source as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: decoded.map((stage, index) => ({
          type: "Feature",
          properties: {
            index,
            name: stage.name,
            distanceKm: stage.distanceKm,
            color: stage.color,
          },
          geometry: { type: "LineString", coordinates: stage.coordinates },
        })),
      });
    }

    let cancelled = false;
    void (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled) return;

      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];

      const allPoints: [number, number][] = [];
      for (const stage of decoded) {
        allPoints.push(...stage.coordinates);
        const start = stage.coordinates[0];
        if (!start) continue;

        const el = document.createElement("div");
        const inner = document.createElement("div");
        const href = stageHrefRef.current(stage.number);
        inner.className =
          "flex size-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white shadow" +
          (href ? " cursor-pointer" : "");
        inner.style.backgroundColor = stage.color;
        inner.textContent =
          stage.number === 0 ? "P" : String(stage.number ?? "•");
        inner.title = stage.name;
        if (href) {
          inner.addEventListener("click", () => router.push(href));
        }
        el.appendChild(inner);

        markersRef.current.push(
          new maplibregl.Marker({ element: el }).setLngLat(start).addTo(map),
        );
      }

      if (allPoints.length > 0) {
        const bounds = allPoints.reduce(
          (acc, point) => acc.extend(point),
          new maplibregl.LngLatBounds(allPoints[0], allPoints[0]),
        );
        map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 500 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [decoded, ready, router]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full overflow-hidden", className)}
    />
  );
}
