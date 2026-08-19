"use client";

import { useEffect } from "react";
import { ErrorComponent } from "@/components/errorComponent";

/**
 * Root error boundary. Next 16 passes `unstable_retry` (not `reset`) — see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.
 */
export default function ErrorPage({
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
    <main>
      <ErrorComponent
        error={error.message}
        digest={error.digest}
        onRetry={unstable_retry}
      />
    </main>
  );
}
