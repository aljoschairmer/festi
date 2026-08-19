"use client";

import { Button } from "@/components/ui/button";

type ErrorComponentProps = {
  error?: string;
  /** When provided, a retry button is shown (e.g. `() => query.refetch()`). */
  onRetry?: () => void;
};

export const ErrorComponent = ({ error, onRetry }: ErrorComponentProps) => {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
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

        {onRetry ? (
          <Button className="mt-6" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    </main>
  );
};
