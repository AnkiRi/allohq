"use client";

import { useEffect } from "react";
import { cn } from "@allohq/ui";
import { OpTag, type OpTagKind } from "./OpTag";
import { StreamOutput, StreamRow } from "./StreamOutput";
import { formatINR } from "./MetricReadout";
import type { DecisionPrediction, DecisionReasonLine } from "./DecisionCard";

// ---------------------------------------------------------------------------
// DecisionDetail — the "view" target for a decision. Opens the ACTUAL thing
// joon lined up before you approve it: who it's for, the drafted message
// (subject + body / rendered email preview), the predicted consequence (upside,
// NAMED downside, confidence, basis), and the reasoning. Fixed overlay so it is
// never clipped by a scrolling container.
// ---------------------------------------------------------------------------

export interface DecisionDetailData {
  title: React.ReactNode;
  tags?: OpTagKind[];
  channel?: string | null;
  segment?: { name: string; count: number } | null;
  impact?: number | null;
  subjectLine?: string | null;
  /** Rendered email/message HTML (real actions). Shown in a sandboxed frame. */
  bodyHtml?: string | null;
  /** Plain draft body when there's no HTML preview (demo / SMS / WhatsApp). */
  bodyText?: React.ReactNode;
  reasoning?: DecisionReasonLine[];
  prediction?: DecisionPrediction | null;
  /** Shown under the consequence when figures aren't yet control-backed. */
  disclaimer?: string;
}

export function DecisionDetail({
  data,
  busy = false,
  onApprove,
  onPass,
  onClose,
}: {
  data: DecisionDetailData;
  busy?: boolean;
  onApprove?: () => void;
  onPass?: () => void;
  onClose: () => void;
}) {
  // Escape to close; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const hasMeta = data.channel || data.segment || (data.impact ?? 0) > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Decision detail"
    >
      {/* scrim */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />

      {/* panel */}
      <div className="relative w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <div className="min-w-0">
            {data.tags && data.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {data.tags.map((t) => (
                  <OpTag key={t} kind={t} />
                ))}
              </div>
            )}
            <p className="font-sans text-[15px] leading-snug text-foreground">
              {data.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[12px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            close
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* who it's for / channel / impact */}
          {hasMeta && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11.5px] text-muted-foreground">
              {data.channel && (
                <span>
                  channel · <span className="text-foreground">{data.channel}</span>
                </span>
              )}
              {data.segment && (
                <span>
                  to ·{" "}
                  <span className="text-foreground">
                    {data.segment.name} ({data.segment.count.toLocaleString("en-IN")})
                  </span>
                </span>
              )}
              {(data.impact ?? 0) > 0 && (
                <span className="text-[hsl(var(--accent))]">
                  ~{formatINR(data.impact as number)}
                </span>
              )}
            </div>
          )}

          {/* the draft */}
          {(data.subjectLine || data.bodyHtml || data.bodyText) && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-3 py-2 border-b border-border bg-background/40 font-mono text-[11px] text-muted-foreground lowercase">
                the draft
              </div>
              {data.subjectLine && (
                <div className="px-4 pt-3 font-sans text-[13.5px]">
                  <span className="text-muted-foreground">subject  </span>
                  <span className="text-foreground font-medium">
                    {data.subjectLine}
                  </span>
                </div>
              )}
              {data.bodyHtml ? (
                <iframe
                  title="Message preview"
                  sandbox=""
                  srcDoc={data.bodyHtml}
                  className="w-full h-[360px] bg-white mt-3"
                />
              ) : data.bodyText ? (
                <div className="px-4 py-3 font-sans text-[13.5px] leading-relaxed text-foreground whitespace-pre-line">
                  {data.bodyText}
                </div>
              ) : null}
            </div>
          )}

          {/* predicted consequence — upside, NAMED downside, confidence, basis */}
          {data.prediction && (
            <div className="rounded-xl border border-border bg-background/40 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-muted-foreground lowercase">
                  predicted consequence
                </span>
                <span
                  className={cn(
                    "lowercase tracking-tight px-1.5 py-0.5 rounded",
                    data.prediction.basis === "calibrated"
                      ? "text-[hsl(var(--accent))] bg-[hsl(var(--accent))]/10"
                      : "text-muted-foreground border border-border",
                  )}
                >
                  {data.prediction.basis === "calibrated"
                    ? "calibrated · control-backed"
                    : "estimate · not yet control-backed"}
                </span>
              </div>
              <div className="space-y-0.5 text-muted-foreground">
                <div>
                  <span className="text-[hsl(var(--accent))]">↗ upside</span>{" "}
                  expected recovery{" "}
                  <b className="text-foreground">
                    {formatINR(data.prediction.upsideRevenue)}
                  </b>{" "}
                  · ~<b className="text-foreground">{data.prediction.liftPct}%</b>{" "}
                  incremental lift vs control
                </div>
                <div>
                  <span className="text-foreground/70">↘ risk</span> ~
                  <b className="text-foreground">
                    {data.prediction.downsideRiskPct}%
                  </b>{" "}
                  unsubscribe / annoyance risk
                </div>
                <div>
                  <span className="text-muted-foreground">· confidence</span>{" "}
                  <b className="text-foreground">{data.prediction.confidence}</b>
                </div>
              </div>
              {data.disclaimer && (
                <p className="mt-2 text-muted-foreground/70 normal-case">
                  {data.disclaimer}
                </p>
              )}
            </div>
          )}

          {/* reasoning */}
          {data.reasoning && data.reasoning.length > 0 && (
            <StreamOutput aria-label="decision reasoning">
              {data.reasoning.map((r, i) => (
                <StreamRow key={i} tick={r.tick ?? "ok"}>
                  {r.text}
                </StreamRow>
              ))}
            </StreamOutput>
          )}
        </div>

        {/* actions */}
        {(onApprove || onPass) && (
          <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-card px-5 py-4">
            {onApprove && (
              <button
                type="button"
                onClick={onApprove}
                disabled={busy}
                className={cn(
                  "font-mono text-[12px] rounded-lg px-4 py-2 transition-colors",
                  "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
                  "hover:opacity-90 disabled:opacity-50",
                )}
              >
                approve
              </button>
            )}
            {onPass && (
              <button
                type="button"
                onClick={onPass}
                disabled={busy}
                className={cn(
                  "font-mono text-[12px] rounded-lg px-4 py-2 transition-colors",
                  "border border-border text-muted-foreground",
                  "hover:bg-muted hover:text-foreground disabled:opacity-50",
                )}
              >
                pass
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="ml-auto font-mono text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
