"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function AutomationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Failed to load automations"
      message={error.message || "Could not load automation data."}
      onRetry={reset}
    />
  );
}
