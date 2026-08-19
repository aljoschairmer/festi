"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Avoid a refetch storm on every mount; polls/invalidations still
            // refresh data explicitly where needed.
            staleTime: 30_000,
            // One retry only: with a hanging server action the default of 3
            // exponential retries kept skeletons spinning for up to ~30 s
            // before any error UI could appear.
            retry: 1,
            // Focus refetches add request bursts without fresh-data value here;
            // polling intervals and mutation invalidations keep data current.
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
