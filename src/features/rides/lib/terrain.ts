import type { Map as MapLibreMap } from "maplibre-gl";

/** Source id of the Terrarium raster-dem source in mapStyle.ts. */
const TERRAIN_SOURCE_ID = "terrain";
/** Hillshade layer id that renders from the terrain source. */
const HILLSHADE_LAYER_ID = "hillshade";

/**
 * Graceful degradation for the keyless Terrarium DEM tiles (AWS Open Data).
 * MapLibre has no fallback-URL mechanism for failing sources, so when the
 * terrain source errors we disable terrain/hillshade once instead of
 * leaving the map hammering a broken endpoint and (for 3D terrain) rendering
 * nothing. The vector basemap keeps working unchanged.
 */
export function guardTerrainSource(map: MapLibreMap): void {
  const onError = (event: { sourceId?: string }) => {
    if (event.sourceId !== TERRAIN_SOURCE_ID) {
      return;
    }

    // Only degrade once; repeated tile errors are expected after failure.
    map.off("error", onError);
    try {
      map.setTerrain(null);
      if (map.getLayer(HILLSHADE_LAYER_ID)) {
        map.removeLayer(HILLSHADE_LAYER_ID);
      }
      if (map.getSource(TERRAIN_SOURCE_ID)) {
        map.removeSource(TERRAIN_SOURCE_ID);
      }
    } catch {
      // Map already disposed or style reloaded; nothing left to clean up.
    }
  };

  map.on("error", onError);
}
