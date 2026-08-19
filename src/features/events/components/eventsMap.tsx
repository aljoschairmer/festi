"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type {
  GeoJSONSource,
  MapLayerMouseEvent,
  Map as MapLibreMap,
  Popup,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { getMapStyle } from "@/features/rides/lib/mapStyle";
import { guardTerrainSource } from "@/features/rides/lib/terrain";
import { eventColor, eventLocation, formatEventDate } from "../lib/eventTypes";
import type { CalendarEvent } from "../types";

type EventsMapProps = {
  events: CalendarEvent[];
  /** Event to fly to and open the popup for (selected from the list). */
  selectedId: string | null;
};

const EVENTS_SOURCE_ID = "radnet-events";
const EVENTS_LAYER_ID = "radnet-events-circles";

/** Roughly frames Germany. */
const GERMANY_CENTER: [number, number] = [10.4, 51.2];
const GERMANY_ZOOM = 5.1;

function toFeatureCollection(events: CalendarEvent[]) {
  return {
    type: "FeatureCollection" as const,
    features: events
      .filter((event) => event.lat !== null && event.lng !== null)
      .map((event) => ({
        type: "Feature" as const,
        properties: {
          id: event.id,
          color: eventColor(event),
          cancelled: event.cancelled,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [event.lng as number, event.lat as number],
        },
      })),
  };
}

/**
 * Popup content is built with DOM APIs (never innerHTML) because titles and
 * locations are scraped from an external site.
 */
function buildPopupContent(event: CalendarEvent): HTMLElement {
  const root = document.createElement("div");
  root.className = "flex max-w-56 flex-col gap-0.5 text-[13px]";

  const title = document.createElement("div");
  title.className = "font-semibold";
  if (event.cancelled) {
    title.className += " line-through opacity-70";
  }
  title.textContent = event.title;
  root.appendChild(title);

  const addMeta = (text: string) => {
    const line = document.createElement("div");
    line.className = "text-xs text-muted-foreground";
    line.textContent = text;
    root.appendChild(line);
  };

  addMeta(
    event.startTime
      ? `${formatEventDate(event.date)} · ${event.startTime}`
      : formatEventDate(event.date),
  );
  const location = eventLocation(event);
  if (location) {
    addMeta(location);
  }
  const typeAndDistances = [
    event.type,
    event.distances.length ? `${event.distances.join(" / ")} km` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (typeAndDistances) {
    addMeta(typeAndDistances);
  }

  if (event.cancelled) {
    const cancelled = document.createElement("div");
    cancelled.className = "text-xs font-medium text-primary";
    cancelled.textContent = event.cancelReason || "Cancelled";
    root.appendChild(cancelled);
  }

  const link = document.createElement("a");
  link.href = event.detailUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className =
    "mt-1.5 inline-block w-fit rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white no-underline hover:bg-primary/80";
  link.textContent = "Details on rad-net ↗";
  root.appendChild(link);

  return root;
}

/**
 * Map of calendar events: one colored dot per event (color = type group),
 * with a details popup on click. Events without synced coordinates are
 * simply not drawn yet.
 */
export function EventsMap({ events, selectedId }: EventsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const eventsRef = useRef(events);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let map: MapLibreMap | null = null;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    void (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) {
        return;
      }

      map = new maplibregl.Map({
        container: containerRef.current,
        style: getMapStyle(),
        center: GERMANY_CENTER,
        zoom: GERMANY_ZOOM,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      guardTerrainSource(map);

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: false },
        }),
        "top-right",
      );

      const observedMap = map;
      resizeObserver = new ResizeObserver(() => observedMap.resize());
      resizeObserver.observe(containerRef.current);

      const openPopup = (event: CalendarEvent) => {
        if (!map || event.lat === null || event.lng === null) {
          return;
        }
        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({
          offset: 10,
          className: "radnet-popup",
        })
          .setLngLat([event.lng, event.lat])
          .setDOMContent(buildPopupContent(event))
          .addTo(map);
      };

      map.on("load", () => {
        if (!map) {
          return;
        }
        map.addSource(EVENTS_SOURCE_ID, {
          type: "geojson",
          data: toFeatureCollection(eventsRef.current),
        });
        map.addLayer({
          id: EVENTS_LAYER_ID,
          type: "circle",
          source: EVENTS_SOURCE_ID,
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              4,
              3.5,
              9,
              6.5,
            ],
            "circle-color": ["get", "color"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-opacity": ["case", ["get", "cancelled"], 0.35, 0.9],
            "circle-stroke-opacity": ["case", ["get", "cancelled"], 0.35, 1],
          },
        });

        map.on("click", EVENTS_LAYER_ID, (clickEvent: MapLayerMouseEvent) => {
          const id = clickEvent.features?.[0]?.properties?.id;
          const event = eventsRef.current.find((entry) => entry.id === id);
          if (event) {
            openPopup(event);
          }
        });
        map.on("mouseenter", EVENTS_LAYER_ID, () => {
          if (map) {
            map.getCanvas().style.cursor = "pointer";
          }
        });
        map.on("mouseleave", EVENTS_LAYER_ID, () => {
          if (map) {
            map.getCanvas().style.cursor = "";
          }
        });

        setReady(true);
        map.resize();
      });
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      popupRef.current?.remove();
      popupRef.current = null;
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }
    const source = map.getSource(EVENTS_SOURCE_ID);
    if (source && "setData" in source) {
      (source as GeoJSONSource).setData(toFeatureCollection(events));
    }
  }, [events, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selectedId) {
      return;
    }
    const event = eventsRef.current.find((entry) => entry.id === selectedId);
    if (!event || event.lat === null || event.lng === null) {
      return;
    }

    map.flyTo({ center: [event.lng, event.lat], zoom: 9, duration: 900 });

    void (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      const activeMap = mapRef.current;
      if (!activeMap) {
        return;
      }
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({
        offset: 10,
        className: "radnet-popup",
      })
        .setLngLat([event.lng as number, event.lat as number])
        .setDOMContent(buildPopupContent(event))
        .addTo(activeMap);
    })();
  }, [selectedId, ready]);

  return <div ref={containerRef} className="h-full w-full" />;
}
