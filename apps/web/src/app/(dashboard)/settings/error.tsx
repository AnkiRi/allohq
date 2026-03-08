"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Failed to load settings"
      message={error.message || "Could not load settings."}
      onRetry={reset}
    />
  );
}
