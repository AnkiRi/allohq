"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function CustomersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Failed to load customers"
      message={error.message || "Could not load customer data."}
      onRetry={reset}
    />
  );
}
