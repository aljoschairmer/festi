"use client";

import { useEffect } from "react";
import { ErrorComponent } from "@/components/errorComponent";

/**
 * Dashboard error boundary — keeps sidebar and header alive when a single
 * page throws, instead of replacing the whole shell via the root boundary.
 */
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorComponent
      error={error.message}
      digest={error.digest}
      onRetry={unstable_retry}
    />
  );
}
