import type { StyleSpecification } from "maplibre-gl";

/**
 * Custom MapLibre basemap: a calm, neutral-cool dark scheme with a clear
 * light-to-dark contrast hierarchy. The app's red is reserved for the route
 * and waypoints so they pop against the muted map. Built on the OpenMapTiles
 * vector schema (MapTiler or keyless OpenFreeMap).
 */

const COLORS = {
  land: "#1b1e23",
  water: "#12222e",
  waterway: "#1d3644",
  wood: "#1a2320",
  park: "#19211c",
  residential: "#202429",
  buildingFill: "#252a30",
  buildingOutline: "#2d333a",
  roadMinor: "#2c3138",
  roadPath: "#343c44",
  roadTertiaryInner: "#3a424b",
  roadTertiaryCasing: "#23272d",
  roadPrimaryInner: "#414a54",
  roadPrimaryCasing: "#262b31",
  roadMotorwayInner: "#48515c",
  roadMotorwayCasing: "#262b31",
  railway: "#2e343b",
  boundary: "#454d57",
  text: "#eef1f5",
  textHalo: "#0a0d11",
  textMuted: "#b3bcc8",
  textWater: "#7fa3ba",

  hillshadeShadow: "#04060a",
  hillshadeHighlight: "#454e59",
  hillshadeAccent: "#0a0d11",

  contour: "#5c5348",
  contourLabel: "#9d9078",
};

const VECTOR_SOURCE = "openmaptiles";

/**
 * Vector tile source. Uses MapTiler's OpenMapTiles tiles when a key is set
 * (better coverage/reliability), otherwise the keyless OpenFreeMap planet.
 * Both share the OpenMapTiles schema, so the themed layers below work with
 * either. Fonts always come from OpenFreeMap (keyless).
 */
function buildVectorSource() {
  const key = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;

  if (key) {
    return {
      type: "vector" as const,
      url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${key}`,
      attribution: "© MapTiler © OpenStreetMap contributors",
    };
  }

  return {
    type: "vector" as const,
    url: "https://tiles.openfreemap.org/planet",
    attribution: "© OpenMapTiles © OpenStreetMap contributors · OpenFreeMap",
  };
}

function buildStyle(): StyleSpecification {
  const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;

  return {
    version: 8,
    name: "Festi Dark",
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      [VECTOR_SOURCE]: buildVectorSource(),

      terrain: {
        type: "raster-dem",
        tiles: [
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        ],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 13,
        attribution: "Elevation: Mapzen / Terrarium",
      },

      ...(maptilerKey
        ? {
            contours: {
              type: "vector" as const,
              url: `https://api.maptiler.com/tiles/contours/tiles.json?key=${maptilerKey}`,
              attribution: "© MapTiler",
            },
          }
        : {}),
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": COLORS.land },
      },
      {
        id: "water",
        type: "fill",
        source: VECTOR_SOURCE,
        "source-layer": "water",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": COLORS.water },
      },
      {
        id: "landcover-wood",
        type: "fill",
        source: VECTOR_SOURCE,
        "source-layer": "landcover",
        minzoom: 8,
        filter: ["==", ["get", "class"], "wood"],
        paint: {
          "fill-color": COLORS.wood,
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 12, 1],
        },
      },
      {
        id: "park",
        type: "fill",
        source: VECTOR_SOURCE,
        "source-layer": "park",
        paint: { "fill-color": COLORS.park },
      },
      {
        id: "landuse-residential",
        type: "fill",
        source: VECTOR_SOURCE,
        "source-layer": "landuse",
        maxzoom: 16,
        filter: ["==", ["get", "class"], "residential"],
        paint: {
          "fill-color": COLORS.residential,
          "fill-opacity": [
            "interpolate",
            ["exponential", 0.6],
            ["zoom"],
            8,
            0.7,
            12,
            0.4,
          ],
        },
      },
      {
        id: "hillshade",
        type: "hillshade",
        source: "terrain",
        paint: {
          "hillshade-exaggeration": 0.6,
          "hillshade-shadow-color": COLORS.hillshadeShadow,
          "hillshade-highlight-color": COLORS.hillshadeHighlight,
          "hillshade-accent-color": COLORS.hillshadeAccent,
        },
      },

      ...(maptilerKey
        ? [
            {
              id: "contour-line",
              type: "line" as const,
              source: "contours",
              "source-layer": "contour",
              minzoom: 11,
              paint: {
                "line-color": COLORS.contour,
                "line-opacity": 0.35,
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  11,
                  0.4,
                  16,
                  1,
                ],
              },
            },
            {
              id: "contour-line-index",
              type: "line" as const,
              source: "contours",
              "source-layer": "contour",
              minzoom: 11,
              filter: [
                "==",
                ["%", ["coalesce", ["get", "height"], ["get", "ele"], 0], 100],
                0,
              ],
              paint: {
                "line-color": COLORS.contour,
                "line-opacity": 0.6,
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  11,
                  0.8,
                  16,
                  1.6,
                ],
              },
            },
            {
              id: "contour-label",
              type: "symbol" as const,
              source: "contours",
              "source-layer": "contour",
              minzoom: 13,
              filter: [
                "==",
                ["%", ["coalesce", ["get", "height"], ["get", "ele"], 0], 100],
                0,
              ],
              layout: {
                "symbol-placement": "line" as const,
                "text-field": [
                  "concat",
                  [
                    "to-string",
                    ["coalesce", ["get", "height"], ["get", "ele"]],
                  ],
                  " m",
                ],
                "text-font": ["Noto Sans Regular"],
                "text-size": 10,
                "symbol-spacing": 300,
              },
              paint: {
                "text-color": COLORS.contourLabel,
                "text-halo-color": COLORS.textHalo,
                "text-halo-width": 1.2,
              },
            },
          ]
        : []),
      {
        id: "waterway",
        type: "line",
        source: VECTOR_SOURCE,
        "source-layer": "waterway",
        paint: { "line-color": COLORS.waterway },
      },
      {
        id: "building",
        type: "fill",
        source: VECTOR_SOURCE,
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-color": COLORS.buildingFill,
          "fill-outline-color": COLORS.buildingOutline,
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 1],
        },
      },
      {
        id: "road-path",
        type: "line",
        source: VECTOR_SOURCE,
        "source-layer": "transportation",
        minzoom: 13,
        filter: ["==", ["get", "class"], "path"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": COLORS.roadPath,
          "line-dasharray": [2, 2],
          "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1, 20, 8],
        },
      },
      {
        id: "road-minor",
        type: "line",
        source: VECTOR_SOURCE,
        "source-layer": "transportation",
        minzoom: 12,
        filter: [
          "match",
          ["get", "class"],
          ["minor", "service", "track"],
          true,
          false,
        ],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": COLORS.roadMinor,
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 20, 12],
        },
      },
      {
        id: "road-secondary-casing",
        type: "line",
        source: VECTOR_SOURCE,
        "source-layer": "transportation",
        minzoom: 9,
        filter: [
          "match",
          ["get", "class"],
          ["secondary", "tertiary"],
          true,
          false,
        ],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": COLORS.roadTertiaryCasing,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 20, 20],
        },
      },
      {
        id: "road-secondary",
        type: "line",
        source: VECTOR_SOURCE,
        "source-layer": "transportation",
        minzoom: 9,
        filter: [
          "match",
          ["get", "class"],
          ["secondary", "tertiary"],
          true,
          false,
        ],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": COLORS.roadTertiaryInner,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 20, 16],
        },
      },
      {
        id: "road-primary-casing",
        type: "line",
        source: VECTOR_SOURCE,
        "source-layer": "transportation",
        minzoom: 7,
        filter: ["match", ["get", "class"], ["primary", "trunk"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": COLORS.roadPrimaryCasing,
          "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1.5, 20, 24],
        },
      },
      {
        id: "road-primary",
        type: "line",
        source: VECTOR_SOURCE,
        "source-layer": "transportation",
        minzoom: 7,
        filter: ["match", ["get", "class"], ["primary", "trunk"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": COLORS.roadPrimaryInner,
          "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.8, 20, 20],
        },
      },
      {
        id: "road-motorway-casing",
        type: "line",
        source: VECTOR_SOURCE,
        "source-layer": "transportation",
        minzoom: 5,
        filter: ["==", ["get", "class"], "motorway"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": COLORS.roadMotorwayCasing,
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 20, 26],
        },
      },
      {
        id: "road-motorway",
        type: "line",
        source: VECTOR_SOURCE,
        "source-layer": "transportation",
        minzoom: 5,
        filter: ["==", ["get", "class"], "motorway"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": COLORS.roadMotorwayInner,
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 20, 22],
        },
      },
      {
        id: "railway",
        type: "line",
        source: VECTOR_SOURCE,
        "source-layer": "transportation",
        minzoom: 13,
        filter: ["==", ["get", "class"], "rail"],
        paint: {
          "line-color": COLORS.railway,
          "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1, 20, 4],
        },
      },
      {
        id: "boundary-country",
        type: "line",
        source: VECTOR_SOURCE,
        "source-layer": "boundary",
        filter: ["==", ["get", "admin_level"], 2],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": COLORS.boundary,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 12, 2],
        },
      },
      {
        id: "boundary-state",
        type: "line",
        source: VECTOR_SOURCE,
        "source-layer": "boundary",
        minzoom: 6,
        filter: [
          "all",
          [">=", ["get", "admin_level"], 3],
          ["<=", ["get", "admin_level"], 4],
        ],
        paint: {
          "line-color": COLORS.boundary,
          "line-dasharray": [2, 2],
          "line-opacity": 0.6,
          "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.8, 12, 1.5],
        },
      },
      {
        id: "label-water",
        type: "symbol",
        source: VECTOR_SOURCE,
        "source-layer": "water_name",
        layout: {
          "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
          "text-font": ["Noto Sans Italic"],
          "text-size": 12,
          "text-max-width": 5,
        },
        paint: {
          "text-color": COLORS.textWater,
          "text-halo-color": COLORS.textHalo,
          "text-halo-width": 1.4,
          "text-halo-blur": 0.4,
        },
      },
      {
        id: "label-road",
        type: "symbol",
        source: VECTOR_SOURCE,
        "source-layer": "transportation_name",
        minzoom: 12,
        layout: {
          "symbol-placement": "line",
          "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 12, 11, 18, 14],
          "text-letter-spacing": 0.05,
        },
        paint: {
          "text-color": COLORS.text,
          "text-halo-color": COLORS.textHalo,
          "text-halo-width": 1.8,
          "text-halo-blur": 0.5,
        },
      },
      {
        id: "label-place-small",
        type: "symbol",
        source: VECTOR_SOURCE,
        "source-layer": "place",
        minzoom: 8,
        filter: [
          "match",
          ["get", "class"],
          ["town", "village", "suburb"],
          true,
          false,
        ],
        layout: {
          "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 12, 15],
          "text-max-width": 8,
        },
        paint: {
          "text-color": COLORS.text,
          "text-halo-color": COLORS.textHalo,
          "text-halo-width": 1.6,
          "text-halo-blur": 0.5,
        },
      },
      {
        id: "label-place-city",
        type: "symbol",
        source: VECTOR_SOURCE,
        "source-layer": "place",
        minzoom: 4,
        filter: ["==", ["get", "class"], "city"],
        layout: {
          "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 11, 18],
          "text-max-width": 8,
        },
        paint: {
          "text-color": COLORS.text,
          "text-halo-color": COLORS.textHalo,
          "text-halo-width": 1.8,
          "text-halo-blur": 0.5,
        },
      },
      {
        id: "label-country",
        type: "symbol",
        source: VECTOR_SOURCE,
        "source-layer": "place",
        maxzoom: 9,
        filter: ["==", ["get", "class"], "country"],
        layout: {
          "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 2, 9, 5, 16],
          "text-transform": "uppercase",
          "text-letter-spacing": 0.1,
          "text-max-width": 6,
        },
        paint: {
          "text-color": COLORS.textMuted,
          "text-halo-color": COLORS.textHalo,
          "text-halo-width": 1.6,
          "text-halo-blur": 0.5,
        },
      },
    ],
  } as StyleSpecification;
}

export function getMapStyle(): StyleSpecification {
  return buildStyle();
}

/** Default map center (Nuremberg) used before a route exists. */
export const DEFAULT_MAP_CENTER: [number, number] = [11.08, 49.45];
export const DEFAULT_MAP_ZOOM = 10;
