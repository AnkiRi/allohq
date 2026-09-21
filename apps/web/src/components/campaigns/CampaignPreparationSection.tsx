"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { CampaignPreparationPanel } from "./CampaignPreparationPanel";
import {
  canApproveDelivery,
  preparationPollInterval,
  type PreparationProgress,
} from "../../lib/campaign-preparation";

export interface PreparationStatus {
  preparation: PreparationProgress | null;
  sendable: boolean;
}

/**
 * Owns the preparation poll for a campaign.
 *
 * Polling lives in a component rather than in the page so it can be mounted
 * and driven in a test: a server-rendered assertion cannot prove that an
 * effect starts a timer, that the timer repeats, or that it stops when the
 * audience is ready.
 *
 * The fetcher is injected so the page can supply a tRPC call and a test can
 * supply a controlled one.
 */
export function CampaignPreparationSection({
  fetchStatus,
  campaignStatus,
  deliveryBlocked = false,
  onApprove,
  onRetry,
  onStatusChange,
  approvePending = false,
  showApproveAction = true,
  pollMsOverride,
}: {
  fetchStatus: () => Promise<PreparationStatus>;
  campaignStatus: string;
  deliveryBlocked?: boolean;
  onApprove?: () => void;
  onRetry?: () => void;
  /** Lets a host page gate its own actions on the same status. */
  onStatusChange?: (status: PreparationStatus | null) => void;
  approvePending?: boolean;
  /** The campaign page has its own approve button; it renders this without one. */
  showApproveAction?: boolean;
  pollMsOverride?: number;
}) {
  const [status, setStatus] = React.useState<PreparationStatus | null>(null);
  const fetchRef = React.useRef(fetchStatus);
  fetchRef.current = fetchStatus;
  const statusChangeRef = React.useRef(onStatusChange);
  statusChangeRef.current = onStatusChange;

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      let next: PreparationStatus | null = null;
      try {
        next = await fetchRef.current();
      } catch {
        // A failed poll must not tear the page down; the next tick retries.
      }
      if (cancelled) return;
      if (next) {
        setStatus(next);
        statusChangeRef.current?.(next);
      }
      const interval = preparationPollInterval(next?.preparation);
      if (interval === false) return;
      timer = setTimeout(tick, pollMsOverride ?? interval);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pollMsOverride]);

  const canApprove = canApproveDelivery({
    campaignStatus,
    progress: status?.preparation,
    deliveryBlocked,
  });

  return (
    <div data-testid="preparation-section">
      <CampaignPreparationPanel
        progress={status?.preparation}
        onRetry={onRetry}
        retryPending={approvePending}
      />
      {showApproveAction && campaignStatus === "draft" && (
        <button
          type="button"
          onClick={onApprove}
          disabled={approvePending || !canApprove}
          data-testid="approve-delivery"
          className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-xs font-sans text-secondary-foreground transition-all hover:bg-secondary/90 disabled:opacity-50"
        >
          {approvePending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {approvePending
            ? "Approving…"
            : status?.preparation?.state === "preparing"
              ? "Preparing audience…"
              : status?.preparation?.state === "needs_attention"
                ? "Audience not ready"
                : deliveryBlocked
                  ? "Delivery disabled"
                  : "Approve delivery"}
        </button>
      )}
    </div>
  );
}
