"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ChevronRight, Radio, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Activity — the operator TERMINAL as a persisted, scrollable log of what joon's
// agents did (autonomous scheduled runs), newest first, grouped by day. The user
// WATCHES here; it is NOT an input. Each run is expandable to its reasoning.
// Data is read from AgentActivityLog (server/DB), so it SURVIVES refresh — this
// is not the cosmetic per-mount setup feed.
// ---------------------------------------------------------------------------

const TZ = "Asia/Kolkata";

// activityType -> calm, human label (the user thinks in outcomes, not "agents").
const LABELS: Record<string, string> = {
  cart_recovery_sent: "Cart recovery",
  churn_intervention: "Win-back",
  ab_test_concluded: "A/B test concluded",
  campaign_opportunity: "Opportunity found",
  auto_send: "Sent",
  browse_abandon: "Browse recovery",
};

function labelFor(type: string): string {
  return LABELS[type] ?? type.replace(/_/g, " ");
}

// Tier -> how the user reads joon's autonomy on this run.
const TIER_NOTE: Record<string, string> = {
  autopilot: "ran on its own",
  copilot: "waiting on you",
  advisor: "suggested",
};

function dayLabel(d: Date): string {
  const now = new Date();
  const fmt = (x: Date) =>
    x.toLocaleDateString("en-IN", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const today = fmt(now);
  const yest = fmt(new Date(now.getTime() - 86400000));
  const key = fmt(d);
  if (key === today) return "Today";
  if (key === yest) return "Yesterday";
  return d.toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatINR(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

interface ActivityRow {
  id: string;
  activityType: string;
  summary: string;
  category: string | null;
  tier: string | null;
  actionTaken: string | null;
  revenue: number | null;
  metadata: unknown;
  createdAt: string | Date;
}

function ActivityEntry({ row }: { row: ActivityRow }) {
  const [open, setOpen] = useState(false);
  const when = new Date(row.createdAt);
  const tierNote = row.tier ? TIER_NOTE[row.tier] : undefined;
  const hasDetail = !!row.metadata;

  return (
    <li className="border-b border-border/60 last:border-b-0">
      <button
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={`w-full flex items-start gap-3 py-3 text-left ${hasDetail ? "hover:bg-muted/40" : "cursor-default"} transition-colors px-1 rounded-lg`}
      >
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums pt-0.5 w-12 shrink-0">
          {timeLabel(when)}
        </span>
        {hasDetail ? (
          <ChevronRight
            className={`w-3.5 h-3.5 text-muted-foreground/60 mt-0.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[hsl(var(--accent))]">
              {labelFor(row.activityType)}
            </span>
            {tierNote && (
              <span className="text-[10px] font-sans text-muted-foreground/70">· {tierNote}</span>
            )}
            {typeof row.revenue === "number" && row.revenue > 0 && (
              <span className="text-[11px] font-mono text-[var(--color-success)]">
                {formatINR(row.revenue)}
              </span>
            )}
          </span>
          <span className="block text-[13px] font-sans text-foreground leading-relaxed mt-0.5">
            {row.summary}
          </span>
          {row.actionTaken === "queued_for_review" && (
            // Cross-reference: a terminal run waiting on the user links to the
            // decision surface where they act on it.
            <Link
              href="/actions"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-mono text-[hsl(var(--accent))] hover:underline"
            >
              review <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </span>
      </button>
      {open && hasDetail && (
        <pre className="ml-[5.4rem] mb-3 mr-1 p-3 rounded-lg bg-muted text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-words">
          {JSON.stringify(row.metadata, null, 2)}
        </pre>
      )}
    </li>
  );
}

export default function ActivityPage() {
  const { data, isLoading } = (trpc.activity.list as any).useQuery(
    { limit: 50 },
    { refetchInterval: 60_000 },
  ) as { data: { items: ActivityRow[]; nextCursor: string | null } | undefined; isLoading: boolean };

  const items = data?.items ?? [];

  // Group by day for the "here's what I did overnight" read.
  const groups: { day: string; rows: ActivityRow[] }[] = [];
  for (const row of items) {
    const day = dayLabel(new Date(row.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else groups.push({ day, rows: [row] });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <Radio className="w-4 h-4 text-[hsl(var(--accent))]" />
          <h1 className="text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
            Activity
          </h1>
        </div>
        <p className="text-[13px] text-muted-foreground font-sans leading-relaxed">
          What joon did while you were away, newest first. The overnight runs and
          background work, with the reasoning behind each.
        </p>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-sm">
            <p className="text-[15px] font-semibold text-foreground font-serif mb-1">
              Nothing logged yet
            </p>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              joon's overnight runs land here, scans, win-backs, recovered carts,
              each with its reasoning. The first briefing runs before sunrise.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-1.5 px-1">
                {g.day}
              </h2>
              <ul className="rounded-xl border border-border bg-card px-3">
                {g.rows.map((row) => (
                  <ActivityEntry key={row.id} row={row} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
