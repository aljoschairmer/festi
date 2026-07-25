import { requireAuth } from "@/features/auth/guards";
import { RidePlanner } from "@/features/rides/components/ridePlanner";
import {
  getGenerationJobResult,
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
  }>;
}) {
  await requireAuth();

  // "Plan ride" from a library route lands here with ?routeId=… and skips
  // straight to the route-building step with the saved waypoints.
  const { routeId, genJob, genIndex } = await searchParams;
  const libraryRoute = routeId ? await getRoute(routeId) : null;

  // "Use this route" from the map generator lands here with the job
  // reference; the route is fetched server-side so the planner starts on
  // the build step with the generated tour already in place.
  let generated = null;
  if (genJob && genIndex !== undefined) {
    const index = Number(genIndex);
    const engineRoutes = Number.isInteger(index)
      ? await getGenerationJobResult(genJob).catch(() => null)
      : null;
    const engineRoute = engineRoutes?.[index];
    if (engineRoute) {
      const route = toRouteResult(engineRoute);
      const [lng, lat] = route.coordinates[0] ?? [];
      generated =
        lng !== undefined && lat !== undefined
          ? {
              route,
              generation: { jobId: genJob, routeIndex: index },
              start: { lat, lng },
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
