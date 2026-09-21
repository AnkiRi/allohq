"use client";

import * as React from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import {
  preparationView,
  type PreparationProgress,
} from "../../lib/campaign-preparation";

/**
 * What the merchant sees while Joon works out a campaign's audience.
 *
 * Extracted from the campaign page so it can be rendered and asserted on
 * directly. The wording and the decision of what to show live in
 * `preparationView`; this only renders them.
 */
export function CampaignPreparationPanel({
  progress,
  onRetry,
  retryPending = false,
}: {
  progress: PreparationProgress | null | undefined;
  onRetry?: () => void;
  retryPending?: boolean;
}) {
  const view = preparationView(progress);

  if (view.kind === "preparing") {
    return (
      <section
        className="app-surface mb-4 p-5 sm:p-6"
        aria-live="polite"
        aria-label="Audience preparation"
        data-testid="preparation-preparing"
      >
        <div className="flex items-start gap-3">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-medium text-foreground">{view.headline}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{view.note}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">{view.reassurance}</p>
            {view.counts.length > 0 && (
              <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
                {view.counts.map((count) => (
                  <div key={count.label}>
                    <dt className="text-[12px] text-muted-foreground">{count.label}</dt>
                    <dd className="mt-0.5 font-mono text-[18px] text-foreground">
                      {count.value.toLocaleString("en-IN")}
                    </dd>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {count.hint}
                    </p>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (view.kind === "needs_attention") {
    return (
      <section
        className="app-surface mb-4 border-warning/30 p-5 sm:p-6"
        aria-live="polite"
        aria-label="Audience preparation needs attention"
        data-testid="preparation-needs-attention"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-medium text-foreground">{view.headline}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{view.reason}</p>
            <p className="mt-1 text-[13px] font-medium text-foreground">{view.reassurance}</p>
            <button
              onClick={onRetry}
              disabled={retryPending}
              data-testid="preparation-retry"
              className="mt-4 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-sans text-foreground transition-all hover:border-primary/50 disabled:opacity-50"
            >
              {retryPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {view.retryLabel}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return null;
}
