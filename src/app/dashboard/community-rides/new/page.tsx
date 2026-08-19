import { requireAuth } from "@/features/auth/guards";
import { RidePlanner } from "@/features/rides/components/ridePlanner";
import {
  buildStreetPoints,
  getGenerationJobResult,
  sampleRouteWaypoints,
  toRouteResult,
} from "@/features/rides/lib/routeEngine";
import { getRoute } from "@/features/routes/actions/getRoute";

export default async function NewRidePage({
  searchParams,
}: {
  searchParams: Promise<{
    routeId?: string;
    genJob?: string;
    genIndex?: string;
    genName?: string;
  }>;
}) {
  await requireAuth();

  const { routeId, genJob, genIndex, genName } = await searchParams;
  const libraryRoute = routeId ? await getRoute(routeId) : null;

  let generated = null;
  if (genJob && genIndex !== undefined) {
    const index = Number(genIndex);
    const engineResult = Number.isInteger(index)
      ? await getGenerationJobResult(genJob).catch(() => null)
      : null;
    const engineRoute =
      engineResult?.status === "ok" ? engineResult.routes[index] : undefined;
    if (engineRoute) {
      const route = toRouteResult(engineRoute);
      const waypoints = sampleRouteWaypoints(
        engineRoute.geojson.geometry.coordinates,
      );
      generated =
        waypoints.length >= 2
          ? {
              route,
              generation: { jobId: genJob, routeIndex: index },
              waypoints,
              roundTrip: engineRoute.mode === "roundtrip",
              name: genName?.slice(0, 100) ?? null,
              highlights: engineRoute.highlights,
              streetPoints: buildStreetPoints(engineRoute),
            }
          : null;
    }
  }

  return (
    <div className="space-y-6">
      <RidePlanner
        initialRoute={
          libraryRoute
            ? { name: libraryRoute.name, waypoints: libraryRoute.waypoints }
            : null
        }
        initialGenerated={generated}
      />
    </div>
  );
}
