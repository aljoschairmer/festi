"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type {
  GeoJSONSource,
  MapLayerMouseEvent,
  Map as MapLibreMap,
  Marker,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  getMapStyle,
} from "../lib/mapStyle";
import { guardTerrainSource } from "../lib/terrain";
import type { MapDot, Waypoint } from "../types";

type RideMapProps = {
  waypoints: Waypoint[];
  /** Route line as `[lng, lat]` pairs. */
  routeCoordinates?: [number, number][];
  /** When true, clicking the map adds a waypoint. */
  interactive?: boolean;
  onAddWaypoint?: (waypoint: Waypoint) => void;
  /** Insert a waypoint at a specific position (used by route dragging). */
  onInsertWaypoint?: (index: number, waypoint: Waypoint) => void;
  /** Move an existing waypoint (used by dragging its marker). */
  onMoveWaypoint?: (index: number, waypoint: Waypoint) => void;
  /** Initial map center as [lng, lat]; falls back to the default. */
  initialCenter?: [number, number];
  /** A point `[lng, lat]` to highlight on the route (e.g. elevation hover). */
  highlight?: [number, number] | null;
  /** Points drawn on top of the route (e.g. live rider positions). */
  dots?: MapDot[];
  /**
   * Additional route candidates drawn dimmed under the main line (route
   * generator). Clicking one selects it via `onSelectAlternative`.
   */
  alternatives?: { id: string; coordinates: [number, number][] }[];
  onSelectAlternative?: (id: string) => void;
  /** When set, the viewport fits these coordinates whenever they change. */
  fitTo?: [number, number][] | null;
  /** When set, the map flies to this `[lng, lat]` whenever it changes. */
  centerOn?: [number, number] | null;
  /** Passive weather badges rendered as DOM markers along the route. */
  weatherMarkers?: WeatherMarkerData[] | null;
  className?: string;
};

/** A small weather badge pinned to a route position. */
export type WeatherMarkerData = {
  id: string;
  lng: number;
  lat: number;
  /** Emoji for the conditions, e.g. "⛅". */
  icon: string;
  /** Short text, e.g. "21° · 13 km/h". */
  label: string;
  /** Wind origin in degrees (0 = north); renders a rotated arrow. */
  windDeg?: number;
};

const ROUTE_SOURCE_ID = "ride-route";
const ROUTE_LAYER_ID = "ride-route-line";
const ROUTE_HIT_LAYER_ID = "ride-route-hit";
const DRAG_SOURCE_ID = "ride-drag";
const DRAG_LAYER_ID = "ride-drag-line";
const HIGHLIGHT_SOURCE_ID = "ride-highlight";
const HIGHLIGHT_LAYER_ID = "ride-highlight-point";
const DOTS_SOURCE_ID = "ride-dots";
const DOTS_LAYER_ID = "ride-dots-points";
const ALT_SOURCE_ID = "ride-alternatives";
const ALT_LAYER_ID = "ride-alternatives-line";
const ALT_HIT_LAYER_ID = "ride-alternatives-hit";

/** Index of the coordinate in `coords` closest to `target` (squared distance). */
function nearestRouteIndex(
  target: { lng: number; lat: number },
  coords: [number, number][],
): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const dx = coords[i][0] - target.lng;
    const dy = coords[i][1] - target.lat;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Determines where a dragged point on the route line should be inserted in the
 * ordered waypoint list, by locating which waypoint segment was grabbed.
 */
function computeInsertIndex(
  grab: { lng: number; lat: number },
  waypoints: Waypoint[],
  coords: [number, number][],
): number {
  if (waypoints.length < 2 || coords.length === 0) {
    return waypoints.length;
  }

  const grabIndex = nearestRouteIndex(grab, coords);
  const anchors = waypoints.map((waypoint) =>
    nearestRouteIndex(waypoint, coords),
  );

  for (let i = 0; i < anchors.length - 1; i++) {
    if (grabIndex >= anchors[i] && grabIndex <= anchors[i + 1]) {
      return i + 1;
    }
  }

  return waypoints.length;
}

export function RideMap({
  waypoints,
  routeCoordinates,
  interactive = false,
  onAddWaypoint,
  onInsertWaypoint,
  onMoveWaypoint,
  initialCenter,
  highlight,
  dots,
  alternatives,
  onSelectAlternative,
  fitTo,
  centerOn,
  weatherMarkers,
  className,
}: RideMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const addWaypointRef = useRef(onAddWaypoint);
  const insertWaypointRef = useRef(onInsertWaypoint);
  const moveWaypointRef = useRef(onMoveWaypoint);
  const selectAlternativeRef = useRef(onSelectAlternative);
  const interactiveRef = useRef(interactive);
  const waypointsRef = useRef(waypoints);
  const routeCoordinatesRef = useRef(routeCoordinates ?? []);
  const initialCenterRef = useRef(initialCenter);
  const lastCenterOnRef = useRef<string | null>(null);
  const weatherMarkersRef = useRef<Marker[]>([]);
  const lastWeatherKeyRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  // Keep the latest values available inside handlers bound once on the map.
  useEffect(() => {
    addWaypointRef.current = onAddWaypoint;
    insertWaypointRef.current = onInsertWaypoint;
    moveWaypointRef.current = onMoveWaypoint;
    selectAlternativeRef.current = onSelectAlternative;
    interactiveRef.current = interactive;
    waypointsRef.current = waypoints;
    routeCoordinatesRef.current = routeCoordinates ?? [];
  }, [
    onAddWaypoint,
    onInsertWaypoint,
    onMoveWaypoint,
    onSelectAlternative,
    interactive,
    waypoints,
    routeCoordinates,
  ]);

  // Initialize the map once.
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
        center: initialCenterRef.current ?? DEFAULT_MAP_CENTER,
        zoom: initialCenterRef.current ? 13 : DEFAULT_MAP_ZOOM,
        attributionControl: { compact: true },
        // Placing waypoints relies on single clicks; double-click zoom would
        // fire when adding points quickly and fight the interaction.
        doubleClickZoom: !interactiveRef.current,
      });
      mapRef.current = map;
      guardTerrainSource(map);

      map.addControl(new maplibregl.NavigationControl(), "top-right");

      // Keep the canvas sized to its container (e.g. when the step animates in
      // or the layout changes), so the map never renders blank/mis-sized.
      const observedMap = map;
      resizeObserver = new ResizeObserver(() => observedMap.resize());
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }

      // Drag-to-shape state, scoped to this map instance.
      let dragTempMarker: Marker | null = null;
      let dragInsertIndex = 0;
      let dragPrev: Waypoint | null = null;
      let dragNext: Waypoint | null = null;
      let isDraggingRoute = false;
      let justDraggedRoute = false;

      const setDragLine = (coords: [number, number][]) => {
        const source = map?.getSource(DRAG_SOURCE_ID);
        if (source && "setData" in source) {
          (source as GeoJSONSource).setData({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: coords },
          });
        }
      };

      const highlightRoute = (on: boolean) => {
        if (!map) {
          return;
        }
        map.setPaintProperty(ROUTE_LAYER_ID, "line-width", on ? 7 : 4);
        map.setPaintProperty(ROUTE_LAYER_ID, "line-opacity", on ? 1 : 0.85);
      };

      const onDragMove = (moveEvent: {
        lngLat: { lng: number; lat: number };
      }) => {
        const point: [number, number] = [
          moveEvent.lngLat.lng,
          moveEvent.lngLat.lat,
        ];
        dragTempMarker?.setLngLat(point);

        // Dashed line from the previous waypoint through the dragged point to
        // the next waypoint, previewing where the new point will sit.
        const coords: [number, number][] = [];
        if (dragPrev) {
          coords.push([dragPrev.lng, dragPrev.lat]);
        }
        coords.push(point);
        if (dragNext) {
          coords.push([dragNext.lng, dragNext.lat]);
        }
        setDragLine(coords);
      };

      const onDragEnd = (endEvent: {
        lngLat: { lng: number; lat: number };
      }) => {
        if (!map) {
          return;
        }
        isDraggingRoute = false;
        map.off("mousemove", onDragMove);
        map.getCanvas().style.cursor = "";
        dragTempMarker?.remove();
        dragTempMarker = null;
        dragPrev = null;
        dragNext = null;
        setDragLine([]);
        highlightRoute(false);

        // Suppress the click that MapLibre emits right after the drag so it
        // doesn't also append a waypoint.
        justDraggedRoute = true;
        setTimeout(() => {
          justDraggedRoute = false;
        }, 0);

        insertWaypointRef.current?.(dragInsertIndex, {
          lat: endEvent.lngLat.lat,
          lng: endEvent.lngLat.lng,
        });
      };

      map.on("load", () => {
        if (!map) {
          return;
        }
        // Alternative candidates sit below the main route line so the
        // selected route always reads as the primary one.
        map.addSource(ALT_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: ALT_LAYER_ID,
          type: "line",
          source: ALT_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#94a3b8",
            "line-width": 4,
            "line-opacity": 0.6,
          },
        });
        map.addLayer({
          id: ALT_HIT_LAYER_ID,
          type: "line",
          source: ALT_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#000000",
            "line-width": 22,
            "line-opacity": 0,
          },
        });
        const altMap = map;
        altMap.on("click", ALT_HIT_LAYER_ID, (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === "string") {
            selectAlternativeRef.current?.(id);
          }
        });
        altMap.on("mouseenter", ALT_HIT_LAYER_ID, () => {
          altMap.getCanvas().style.cursor = "pointer";
        });
        altMap.on("mouseleave", ALT_HIT_LAYER_ID, () => {
          altMap.getCanvas().style.cursor = "";
        });

        map.addSource(ROUTE_SOURCE_ID, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [] },
          },
        });
        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#ef4444",
            "line-width": 4,
            "line-opacity": 0.85,
          },
        });
        // Wide, invisible layer on top of the line to make it easy to grab.
        map.addLayer({
          id: ROUTE_HIT_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#000000",
            "line-width": 22,
            "line-opacity": 0,
          },
        });
        // Dashed preview line shown while dragging a new point.
        map.addSource(DRAG_SOURCE_ID, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [] },
          },
        });
        map.addLayer({
          id: DRAG_LAYER_ID,
          type: "line",
          source: DRAG_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#ef4444",
            "line-width": 3,
            "line-opacity": 0.9,
            "line-dasharray": [0, 2],
          },
        });

        // Highlight point (e.g. driven by hovering the elevation graph).
        map.addSource(HIGHLIGHT_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: HIGHLIGHT_LAYER_ID,
          type: "circle",
          source: HIGHLIGHT_SOURCE_ID,
          paint: {
            "circle-radius": 7,
            "circle-color": "#ef4444",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 3,
          },
        });

        // Overlay dots (e.g. live rider positions) with a hover/tap popup.
        map.addSource(DOTS_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: DOTS_LAYER_ID,
          type: "circle",
          source: DOTS_SOURCE_ID,
          layout: {
            // Draw larger dots (e.g. jersey wearers) on top of the peloton.
            "circle-sort-key": ["coalesce", ["get", "radius"], 6],
          },
          paint: {
            "circle-radius": ["coalesce", ["get", "radius"], 6],
            "circle-color": ["get", "color"],
            "circle-stroke-color": ["coalesce", ["get", "stroke"], "#ffffff"],
            "circle-stroke-width": 2,
          },
        });

        const dotsPopup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 10,
        });
        const showDotPopup = (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          if (!feature || !map) return;
          const props = feature.properties as {
            title?: string;
            subtitle?: string;
            imageUrl?: string;
          };
          if (!props?.title) return;
          const content = document.createElement("div");
          content.className =
            "flex items-center gap-2 text-xs text-neutral-900";
          if (props.imageUrl) {
            // Photo (e.g. a rider head-shot) next to the text block.
            const image = document.createElement("img");
            image.src = props.imageUrl;
            image.alt = "";
            image.className =
              "size-9 shrink-0 rounded-full bg-neutral-100 object-cover";
            // A dead CDN link should not leave a broken-image icon behind.
            image.onerror = () => image.remove();
            content.appendChild(image);
          }
          const text = document.createElement("div");
          content.appendChild(text);
          const title = document.createElement("div");
          title.className = "font-semibold";
          title.textContent = props.title;
          text.appendChild(title);
          if (props.subtitle) {
            const subtitle = document.createElement("div");
            subtitle.className = "text-neutral-500";
            subtitle.textContent = props.subtitle;
            text.appendChild(subtitle);
          }
          dotsPopup.setLngLat(event.lngLat).setDOMContent(content).addTo(map);
        };
        map.on("mouseenter", DOTS_LAYER_ID, (event) => {
          if (map) map.getCanvas().style.cursor = "pointer";
          showDotPopup(event);
        });
        map.on("mousemove", DOTS_LAYER_ID, showDotPopup);
        map.on("mouseleave", DOTS_LAYER_ID, () => {
          if (map) map.getCanvas().style.cursor = "";
          dotsPopup.remove();
        });
        // Tap support on touch devices, where mouseenter never fires.
        map.on("click", DOTS_LAYER_ID, showDotPopup);

        map.on("mouseenter", ROUTE_HIT_LAYER_ID, () => {
          if (interactiveRef.current && map) {
            map.getCanvas().style.cursor = "grab";
            highlightRoute(true);
          }
        });
        map.on("mouseleave", ROUTE_HIT_LAYER_ID, () => {
          if (!isDraggingRoute && map) {
            map.getCanvas().style.cursor = "";
            highlightRoute(false);
          }
        });

        map.on("mousedown", ROUTE_HIT_LAYER_ID, (downEvent) => {
          if (!interactiveRef.current || !map) {
            return;
          }

          // If the press starts on/near an existing waypoint, let the marker
          // handle the drag instead of inserting a new point.
          const activeMap = map;
          const nearWaypoint = waypointsRef.current.some((wp) => {
            const projected = activeMap.project([wp.lng, wp.lat]);
            return (
              Math.hypot(
                projected.x - downEvent.point.x,
                projected.y - downEvent.point.y,
              ) < 18
            );
          });
          if (nearWaypoint) {
            return;
          }

          // Prevent the map from panning while we drag the route.
          downEvent.preventDefault();
          isDraggingRoute = true;
          dragInsertIndex = computeInsertIndex(
            downEvent.lngLat,
            waypointsRef.current,
            routeCoordinatesRef.current,
          );
          dragPrev = waypointsRef.current[dragInsertIndex - 1] ?? null;
          dragNext = waypointsRef.current[dragInsertIndex] ?? null;

          const el = document.createElement("div");
          el.className =
            "size-4 rounded-full border-2 border-primary bg-white shadow";
          dragTempMarker = new maplibregl.Marker({ element: el })
            .setLngLat([downEvent.lngLat.lng, downEvent.lngLat.lat])
            .addTo(map);

          map.getCanvas().style.cursor = "grabbing";
          map.on("mousemove", onDragMove);
          map.once("mouseup", onDragEnd);
        });

        setReady(true);
        map.resize();
      });

      map.on("click", (event) => {
        if (justDraggedRoute) {
          return;
        }
        addWaypointRef.current?.({
          lat: event.lngLat.lat,
          lng: event.lngLat.lng,
        });
      });
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      for (const marker of markersRef.current) {
        marker.remove();
      }
      markersRef.current = [];
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Render waypoint markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled) {
        return;
      }

      for (const marker of markersRef.current) {
        marker.remove();
      }
      markersRef.current = [];

      const first = waypoints[0];
      const last = waypoints[waypoints.length - 1];
      const isRoundTrip =
        waypoints.length > 1 &&
        first.lat === last.lat &&
        first.lng === last.lng;

      waypoints.forEach((waypoint, index) => {
        const isStart = index === 0;
        const isEnd = waypoints.length > 1 && index === waypoints.length - 1;

        // For a round trip the start and end share a location — render one
        // combined marker and skip the duplicate end.
        if (isRoundTrip && isEnd) {
          return;
        }

        const interactiveMarker = interactiveRef.current;
        // Start = green, end = blue, intermediate stops = red.
        const bgClass = isStart
          ? "bg-green-500"
          : isEnd
            ? "bg-blue-500"
            : "bg-primary";
        const label =
          isRoundTrip && isStart
            ? "S/E"
            : isStart
              ? "S"
              : isEnd
                ? "E"
                : String(index + 1);
        // Outer element is positioned by MapLibre (inline transform); the inner
        // element handles the hover scale so the two transforms don't clash.
        const el = document.createElement("div");
        const inner = document.createElement("div");
        inner.className =
          `flex size-6 items-center justify-center rounded-full border-2 border-white ${bgClass} text-[10px] font-semibold text-white shadow` +
          (interactiveMarker
            ? " cursor-grab transition-transform duration-150 hover:scale-125 hover:ring-2 hover:ring-white/70"
            : "");
        inner.textContent = label;
        el.appendChild(inner);

        const marker = new maplibregl.Marker({
          element: el,
          draggable: interactiveMarker,
        })
          .setLngLat([waypoint.lng, waypoint.lat])
          .addTo(map);

        if (interactiveMarker) {
          marker.on("dragstart", () => {
            inner.style.cursor = "grabbing";
          });
          marker.on("dragend", () => {
            inner.style.cursor = "";
            const lngLat = marker.getLngLat();
            moveWaypointRef.current?.(index, {
              lat: lngLat.lat,
              lng: lngLat.lng,
            });
          });
        }

        markersRef.current.push(marker);
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [waypoints, ready]);

  // Update the route line whenever the geometry changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }

    const source = map.getSource(ROUTE_SOURCE_ID);
    if (source && "setData" in source) {
      (source as GeoJSONSource).setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: routeCoordinates ?? [],
        },
      });
    }
  }, [routeCoordinates, ready]);

  // Update the alternative candidate lines (route generator).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }

    const source = map.getSource(ALT_SOURCE_ID);
    if (source && "setData" in source) {
      (source as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: (alternatives ?? []).map((alternative) => ({
          type: "Feature",
          properties: { id: alternative.id },
          geometry: {
            type: "LineString",
            coordinates: alternative.coordinates,
          },
        })),
      });
    }
  }, [alternatives, ready]);

  // Fly to a requested center (e.g. the just-located start position).
  // Deliberately not gated on `ready`: the camera works before the style
  // has loaded, and the value is deduped so re-renders with a fresh array
  // identity don't restart the animation mid-flight.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !centerOn) {
      return;
    }
    const key = `${centerOn[0]},${centerOn[1]}`;
    if (lastCenterOnRef.current === key) {
      return;
    }
    lastCenterOnRef.current = key;
    map.flyTo({ center: centerOn, zoom: Math.max(map.getZoom(), 12) });
  }, [centerOn]);

  // Weather badges along the route. Plain DOM markers, so they work even
  // before the style has loaded; deduped by value because the array gets
  // a fresh identity on every render.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const key = (weatherMarkers ?? [])
      .map((m) => `${m.id}:${m.lng}:${m.lat}:${m.label}`)
      .join("|");
    if (lastWeatherKeyRef.current === key) {
      return;
    }
    lastWeatherKeyRef.current = key;

    let cancelled = false;
    void (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled) {
        return;
      }
      for (const marker of weatherMarkersRef.current) {
        marker.remove();
      }
      weatherMarkersRef.current = [];

      for (const data of weatherMarkers ?? []) {
        const el = document.createElement("div");
        el.className =
          "flex items-center gap-1 rounded-full border bg-background/95 px-2 py-0.5 text-[10px] font-medium shadow backdrop-blur pointer-events-none";
        const icon = document.createElement("span");
        icon.textContent = data.icon;
        el.appendChild(icon);
        const text = document.createElement("span");
        text.textContent = data.label;
        el.appendChild(text);
        if (data.windDeg !== undefined) {
          const arrow = document.createElement("span");
          arrow.textContent = "↑";
          // The glyph points north; rotate it to where the wind blows TO.
          arrow.style.transform = `rotate(${(data.windDeg + 180) % 360}deg)`;
          arrow.style.display = "inline-block";
          el.appendChild(arrow);
        }
        weatherMarkersRef.current.push(
          new maplibregl.Marker({
            element: el,
            anchor: "bottom",
            offset: [0, -8],
          })
            .setLngLat([data.lng, data.lat])
            .addTo(map),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weatherMarkers]);

  // Fit the viewport to the given coordinates (e.g. a freshly generated
  // route) whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !fitTo || fitTo.length < 2) {
      return;
    }
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const [lng, lat] of fitTo) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 80, duration: 700 },
    );
  }, [fitTo, ready]);

  // Update the highlight marker (elevation-graph hover).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }

    const source = map.getSource(HIGHLIGHT_SOURCE_ID);
    if (source && "setData" in source) {
      (source as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: highlight
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: highlight },
              },
            ]
          : [],
      });
    }
  }, [highlight, ready]);

  // Update the overlay dots (live rider positions) whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }

    const source = map.getSource(DOTS_SOURCE_ID);
    if (source && "setData" in source) {
      (source as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: (dots ?? []).map((dot) => ({
          type: "Feature",
          properties: {
            color: dot.color,
            stroke: dot.stroke ?? "#ffffff",
            radius: dot.radius ?? 6,
            title: dot.title ?? "",
            subtitle: dot.subtitle ?? "",
            imageUrl: dot.imageUrl ?? "",
          },
          geometry: { type: "Point", coordinates: [dot.lng, dot.lat] },
        })),
      });
    }
  }, [dots, ready]);

  // Fit the view to the route. Only on read-only previews — auto-fitting while
  // the user is placing waypoints fights their clicks by zooming/panning.
  useEffect(() => {
    if (interactive) {
      return;
    }

    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }

    const points: [number, number][] =
      routeCoordinates && routeCoordinates.length > 0
        ? routeCoordinates
        : waypoints.map((waypoint) => [waypoint.lng, waypoint.lat]);

    if (points.length === 0) {
      return;
    }

    void (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      const bounds = points.reduce(
        (acc, point) => acc.extend(point),
        new maplibregl.LngLatBounds(points[0], points[0]),
      );
      map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 500 });
    })();
  }, [routeCoordinates, waypoints, ready, interactive]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "h-full w-full overflow-hidden rounded-lg",
        interactive && "cursor-crosshair",
        className,
      )}
    />
  );
}
