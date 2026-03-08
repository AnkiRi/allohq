"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function CampaignsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Failed to load campaigns"
      message={error.message || "Could not load campaign data."}
      onRetry={reset}
    />
  );
}
