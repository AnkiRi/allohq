"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function DashboardPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Failed to load dashboard"
      message={error.message || "Could not load your dashboard data."}
      onRetry={reset}
    />
  );
}
