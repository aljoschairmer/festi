"use client";

export default function LoadingComponent() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex max-w-md flex-col items-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary"
          aria-hidden="true"
        />

        <h2 className="mt-6 text-2xl font-medium text-foreground">Loading</h2>

        <p className="mt-3 text-sm text-muted-foreground">
          Please wait while we prepare everything for you.
        </p>
      </div>
    </div>
  );
}
