"use client";

import { Button } from "@/components/ui/button";

type ErrorComponentProps = {
  /** Human-readable detail, if the caller has one worth showing. */
  error?: string;
  /** Wired to Next's `unstable_retry` so the segment can re-render. */
  onRetry?: () => void;
  /** Shown under the message; useful when reporting a bug. */
  digest?: string;
};

export const ErrorComponent = ({
  error,
  onRetry,
  digest,
}: ErrorComponentProps) => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-6xl font-semibold tracking-tight text-foreground">
          500
        </h1>

        <h2 className="mt-4 text-2xl font-medium text-foreground">
          Something went wrong
        </h2>

        <p className="mt-3 text-sm text-muted-foreground">
          {error || "An unexpected error occurred."}
        </p>

        {digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground/80">
            Reference: {digest}
          </p>
        )}

        {onRetry && (
          <Button className="mt-6" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
};
