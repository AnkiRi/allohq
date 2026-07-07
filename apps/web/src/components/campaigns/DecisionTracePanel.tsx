"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

// "How allo decided" — allo showing its work, in plain language (not an ML dashboard).
// Reads the real decision trace: what allo chose + why, the held-out control (the
// counterfactual), the state each customer was in, and what happened. Honest labels: numbers
// stay flagged illustrative on demo data, and lift is shown with its significance.
export function DecisionTracePanel({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const { data } = (trpc.campaigns.decisionTrace as any).useQuery({ id: campaignId }) as {
    data:
      | {
          isSynthetic: boolean;
          decision: { intent: string | null; segment: string | null; discountPercent: number | null; channel: string };
          human: { acceptedAsProposed: boolean | null; overrides: Record<string, unknown> } | null;
          experiment: { splitRatio: number | null; controlCount: number; treatmentCount: number };
          stats: null | { lift: number; ciLow: number; ciHigh: number; significant: boolean; underpowered: boolean };
          samples: Array<{ name: string; segment: string | null; orders: number | null; arm: string | null; outcome: string | null; revenue: number }>;
        }
      | undefined;
  };
  if (!data) return null;

  const d = data.decision;
  const s = data.stats;
  const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const n = (x: number) => x.toLocaleString("en-IN");

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-px h-6 bg-secondary" />
          <h2 className="text-[13px] font-bold text-foreground font-serif">How allo decided</h2>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-5 border-t border-border pt-5">
          {/* The decision */}
          <div>
            <div className="text-[10px] uppercase tracking-[1px] text-muted-foreground font-sans font-bold mb-1.5">
              The decision
            </div>
            <p className="text-[13px] text-foreground font-sans leading-relaxed">
              allo chose to send a <b>{d.intent?.replace(/_/g, " ") ?? "retention"}</b> email
              {d.discountPercent ? (
                <>
                  {" "}with a <b>{d.discountPercent}% offer</b>
                </>
              ) : null}{" "}
              to <b>{d.segment ?? "your customers"}</b> ({n(data.experiment.treatmentCount)} people), and{" "}
              <b>held out {n(data.experiment.controlCount)}</b> as a control
              {data.experiment.splitRatio ? <> ({Math.round(data.experiment.splitRatio * 100)}%)</> : null} — so the
              lift can be proven, not guessed.
            </p>
            {data.human && data.human.acceptedAsProposed !== null && (
              <p className="text-[12px] text-muted-foreground font-sans mt-1.5">
                {data.human.acceptedAsProposed
                  ? "You shipped allo's proposal as-is."
                  : `You adjusted: ${Object.keys(data.human.overrides ?? {}).join(", ") || "the plan"}.`}
              </p>
            )}
          </div>

          {/* What happened */}
          {s && (
            <div>
              <div className="text-[10px] uppercase tracking-[1px] text-muted-foreground font-sans font-bold mb-1.5">
                What happened
              </div>
              <p className="text-[13px] text-foreground font-sans leading-relaxed">
                The emailed group earned <b>{money(s.lift)}/customer more</b> than the held-out control.{" "}
                <span className="font-mono text-[12px] text-muted-foreground">
                  (95% CI {money(s.ciLow)}…{money(s.ciHigh)})
                </span>
              </p>
              <span
                className={`inline-block mt-1.5 text-[11px] font-mono ${
                  s.significant ? "text-[hsl(var(--accent))]" : "text-amber-500"
                }`}
              >
                {s.underpowered
                  ? "· gathering data — not enough yet to be sure"
                  : s.significant
                    ? "· statistically significant"
                    : "· not yet significant"}
              </span>
            </div>
          )}

          {/* allo's growth call — do more by sending LESS. Derived from the measured
              significance above; never asserted beyond what the control group shows. */}
          {s && !s.underpowered && (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[1px] text-muted-foreground font-sans font-bold mb-1.5">
                allo's growth call
              </div>
              {s.significant && s.lift > 0 ? (
                <p className="text-[13px] text-foreground font-sans leading-relaxed">
                  <span className="text-[hsl(var(--accent))] font-semibold">Keep sending this segment.</span>{" "}
                  The lift is real, so every message here earns its place — this is where allo
                  concentrates the sends.
                </p>
              ) : (
                <p className="text-[13px] text-foreground font-sans leading-relaxed">
                  <span className="text-[hsl(var(--accent))] font-semibold">Hold this segment back next time.</span>{" "}
                  They largely bought anyway — the emails didn't cause the revenue. Skipping them means
                  the same revenue with fewer sends, and a channel that stays worth opening.
                </p>
              )}
            </div>
          )}

          {/* A few customers */}
          {data.samples.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[1px] text-muted-foreground font-sans font-bold mb-2">
                A few customers
              </div>
              <div className="space-y-1.5">
                {data.samples.map((c, i) => (
                  <div key={i} className="text-[12.5px] font-sans text-foreground flex flex-wrap items-baseline gap-x-1.5">
                    <b>{c.name}</b>
                    {c.segment ? (
                      <span className="text-muted-foreground">
                        ({c.segment}
                        {c.orders ? `, ${c.orders} orders` : ""})
                      </span>
                    ) : null}
                    <span className="text-muted-foreground">—</span>
                    <span>{c.arm === "CONTROL" ? "held out (no email)" : "got the email"}</span>
                    <span className="text-muted-foreground">—</span>
                    <span className={c.outcome === "purchased" ? "text-foreground" : "text-muted-foreground"}>
                      {c.outcome === "purchased" ? `bought ${money(c.revenue)}` : "didn't buy"}
                      {c.arm === "CONTROL" && c.outcome === "purchased" ? " anyway — so allo didn't cause this" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.isSynthetic && (
            <p className="text-[11px] text-muted-foreground/70 font-sans italic">
              Demo data — figures illustrative while control measurement accrues.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
