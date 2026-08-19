import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalidates every client-side ride cache after a ride mutation
 * (create/update/cancel/delete/join/leave). Ride detail pages are
 * server-rendered, so callers should also trigger `router.refresh()`.
 */
export function invalidateRideQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["rides"] });
  queryClient.invalidateQueries({ queryKey: ["group-rides"] });
  queryClient.invalidateQueries({ queryKey: ["user-rides"] });
}
