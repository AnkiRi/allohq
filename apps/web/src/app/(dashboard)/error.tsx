"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <ErrorState
        title="Something went wrong"
        message={error.message || "An unexpected error occurred. Please try again."}
        onRetry={reset}
      />
    </div>
  );
}
