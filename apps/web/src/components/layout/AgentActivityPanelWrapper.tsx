"use client";

import { trpc } from "@/lib/trpc";
import { AgentActivityPanel } from "./AgentActivityPanel";

/**
 * Wrapper that fetches storeId and conditionally renders the
 * AgentActivityPanel. Lives in the dashboard layout so it persists
 * across page navigations.
 */
export function AgentActivityPanelWrapper() {
  const { data: stores } = trpc.stores.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const storeId = stores?.[0]?.id ?? null;

  return <AgentActivityPanel storeId={storeId} />;
}
