import polyline from "@mapbox/polyline";
import type { RouteHighlight, RoutePlaceName, Waypoint } from "../types";

/**
 * Decodes a stored polyline into `[lng, lat]` pairs for map rendering.
 * Client-safe: contains no server-only dependencies.
 */
export function decodeRouteGeometry(geometry: string): [number, number][] {
  return polyline.decode(geometry).map(([lat, lng]) => [lng, lat]);
}

/** Great-circle distance in meters between two `[lng, lat]` points. */
function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Names each waypoint after the street it sits on: nearest street-name
 * sample within `maxM` meters. Streets may legitimately name several
 * points (a long road crosses many vias) — the km subtitle keeps rows
 * distinguishable.
 */
export function waypointStreetNames(
  waypoints: Waypoint[],
  streetPoints: RoutePlaceName[],
  maxM = 300,
): (string | null)[] {
  if (streetPoints.length === 0) {
    return waypoints.map(() => null);
  }
  return waypoints.map((waypoint) => {
    let bestName: string | null = null;
    let bestDist = maxM;
    for (const point of streetPoints) {
      const dist = haversineMeters(
        [waypoint.lng, waypoint.lat],
        [point.lng, point.lat],
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestName = point.name;
      }
    }
    return bestName;
  });
}

/**
 * Names each waypoint after the closest named highlight within `maxM`
 * meters ("Lindener Berg"), the way Komoot labels points by what is
 * actually there. Each highlight names at most one waypoint (greedy,
 * nearest first); waypoints with nothing nearby get `null`.
 */
export function waypointHighlightNames(
  waypoints: Waypoint[],
  highlights: RouteHighlight[],
  maxM = 800,
): (string | null)[] {
  const named = highlights.filter((highlight) => highlight.name);
  if (named.length === 0) {
    return waypoints.map(() => null);
  }

  const pairs: { waypointIndex: number; name: string; distM: number }[] = [];
  for (let i = 0; i < waypoints.length; i++) {
    for (const highlight of named) {
      const distM = haversineMeters(
        [waypoints[i].lng, waypoints[i].lat],
        [highlight.lng, highlight.lat],
      );
      if (distM <= maxM) {
        pairs.push({
          waypointIndex: i,
          name: highlight.name as string,
          distM,
        });
      }
    }
  }
  pairs.sort((a, b) => a.distM - b.distM);

  const names: (string | null)[] = waypoints.map(() => null);
  const usedNames = new Set<string>();
  for (const pair of pairs) {
    if (names[pair.waypointIndex] !== null || usedNames.has(pair.name)) {
      continue;
    }
    names[pair.waypointIndex] = pair.name;
    usedNames.add(pair.name);
  }
  return names;
}

/**
 * Positions each waypoint along the route as "km from the start" by
 * snapping it to the nearest route coordinate. Gives the waypoint list a
 * meaningful location ("km 12.4") instead of raw coordinates.
 */
export function waypointKmPositions(
  waypoints: Waypoint[],
  routeCoordinates: [number, number][],
): number[] {
  if (routeCoordinates.length < 2) {
    return waypoints.map(() => 0);
  }

  const cumulativeM: number[] = [0];
  for (let i = 1; i < routeCoordinates.length; i++) {
    cumulativeM.push(
      cumulativeM[i - 1] +
        haversineMeters(routeCoordinates[i - 1], routeCoordinates[i]),
    );
  }

  return waypoints.map((waypoint) => {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < routeCoordinates.length; i++) {
      const dx = routeCoordinates[i][0] - waypoint.lng;
      const dy = routeCoordinates[i][1] - waypoint.lat;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return cumulativeM[best] / 1000;
  });
}
