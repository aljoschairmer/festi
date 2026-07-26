import { requireAuth } from "@/features/auth/guards";
import { RouteGeneratorMap } from "@/features/rides/components/routeGeneratorMap";

/**
 * Full-map route generator: pick a start on the map (or via search /
 * browser location) and compare generated tour candidates in place.
 */
export default async function GenerateRoutePage() {
  await requireAuth();

  return <RouteGeneratorMap />;
}
