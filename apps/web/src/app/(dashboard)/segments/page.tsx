"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, ArrowUpRight, Plus, ShoppingCart, Layers } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  ConsoleFrame,
  StreamOutput,
  StreamRow,
  MetricReadout,
  formatINR,
} from "@/components/console";

type Tab = "rfm" | "baskets";

// Segments that read as "needs attention" in operator language.
const AT_RISK_SEGMENTS = new Set([
  "At Risk",
  "Hibernating",
  "Lost",
  "Can't Lose Them",
]);

export default function SegmentsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("rfm");

  const segmentsQuery = trpc.segments.list.useQuery();
  const distQuery = trpc.segments.distribution.useQuery();
  const basketQuery = trpc.segments.getBasketArchetypes.useQuery();

  const segments = segmentsQuery.data as any[] | undefined;
  const distribution = distQuery.data as any[] | undefined;
  const baskets = basketQuery.data as any[] | undefined;
  const segmentsLoading = segmentsQuery.isLoading;
  const distLoading = distQuery.isLoading;
  const basketsLoading = basketQuery.isLoading;

  const isLoading = segmentsLoading || distLoading;

  // Merge segment definitions with distribution data.
  const mergedSegments = (segments ?? []).map((seg: any) => {
    const dist = (distribution ?? []).find((d: any) => d.segment === seg.name);
    return {
      ...seg,
      liveCount: dist?.customerCount ?? seg.customerCount,
      liveRevenue: dist?.totalRevenue ?? seg.totalRevenue,
      avgOrder: dist?.avgOrderValue ?? 0,
    };
  });

  const totalCustomers = mergedSegments.reduce(
    (sum: number, s: any) => sum + s.liveCount,
    0,
  );
  const populatedSegments = mergedSegments.filter((s: any) => s.liveCount > 0);

  // Largest segment — for the warm-voice opportunity line.
  const largestSegment =
    populatedSegments.length > 0
      ? populatedSegments.reduce(
          (max: any, s: any) => (s.liveCount > max.liveCount ? s : max),
          populatedSegments[0],
        )
      : null;
  // Biggest at-risk cohort — the opportunity allo would point to.
  const atRiskSegments = populatedSegments.filter((s: any) =>
    AT_RISK_SEGMENTS.has(s.name),
  );
  const biggestRisk =
    atRiskSegments.length > 0
      ? atRiskSegments.reduce(
          (max: any, s: any) => (s.liveCount > max.liveCount ? s : max),
          atRiskSegments[0],
        )
      : null;

  // The single segment to frame as "your biggest opportunity".
  const opportunity = biggestRisk ?? largestSegment;

  // Max count, so terminal bars scale to the largest populated segment.
  const maxCount = populatedSegments.reduce(
    (m: number, s: any) => Math.max(m, s.liveCount),
    0,
  );

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto">
      {/* Heading — prose, no motion */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground font-serif">
            The base
          </h1>
          <p className="text-[13.5px] text-muted-foreground mt-1 font-sans leading-relaxed">
            How allo reads your customers, grouped by how they shop, and what
            they tend to buy together.
          </p>
        </div>
        <Link
          href="/segments/new"
          className="flex-shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-card text-foreground font-mono text-[12px] hover:border-muted-foreground/40 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          new segment
        </Link>
      </div>

      {/* Tab switcher — operator chips */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("rfm")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-mono text-[12px] lowercase transition-colors ${
            activeTab === "rfm"
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          rfm segments
        </button>
        <button
          onClick={() => setActiveTab("baskets")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-mono text-[12px] lowercase transition-colors ${
            activeTab === "baskets"
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          basket patterns
          {baskets && baskets.length > 0 && (
            <span className="ml-1 font-mono text-[10px] text-[hsl(var(--accent))] tabular-nums">
              {baskets.length}
            </span>
          )}
        </button>
      </div>

      {/* RFM Segments tab */}
      {activeTab === "rfm" && (
        <ConsoleFrame title="allo · segment view">
          {/* Status line — pure counts. The "largest" and "watch" framing lives
              in the warm-voice stream just below, so it isn't said twice. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-4 mb-4 border-b border-border">
            <MetricReadout label="customers" value={totalCustomers} live />
            <MetricReadout label="segments" value={populatedSegments.length} />
            {atRiskSegments.length > 0 && (
              <MetricReadout
                label="watch"
                value={atRiskSegments.length}
              />
            )}
          </div>

          {/* Warm-voice stream — N customers across M segments · opportunity */}
          {totalCustomers > 0 && (
            <StreamOutput
              aria-label="how allo reads your base"
              className="mb-5"
            >
              <StreamRow tick="ok">
                <b>{totalCustomers.toLocaleString("en-IN")}</b> customers across{" "}
                <b>{populatedSegments.length}</b> segments
              </StreamRow>
              {opportunity && (
                <StreamRow tick={biggestRisk ? "hold" : "ok"}>
                  {biggestRisk ? (
                    <>
                      your biggest opportunity is{" "}
                      <b>{opportunity.name}</b>:{" "}
                      <b>{opportunity.liveCount.toLocaleString("en-IN")}</b>{" "}
                      customers worth{" "}
                      <b>{formatINR(opportunity.liveRevenue)}</b> are slipping;
                      a warm note usually brings them back
                    </>
                  ) : (
                    <>
                      your biggest group is <b>{opportunity.name}</b>:{" "}
                      <b>{opportunity.liveCount.toLocaleString("en-IN")}</b>{" "}
                      customers who&apos;ve brought in{" "}
                      <b>{formatINR(opportunity.liveRevenue)}</b> so far
                    </>
                  )}
                </StreamRow>
              )}
            </StreamOutput>
          )}

          {/* Segment distribution — mono readouts + terminal-style bars */}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-9 bg-muted/40 rounded animate-pulse" />
              ))}
            </div>
          ) : populatedSegments.length > 0 ? (
            <div className="space-y-1">
              {populatedSegments
                .slice()
                .sort((a: any, b: any) => b.liveCount - a.liveCount)
                .map((seg: any) => {
                  const pct =
                    totalCustomers > 0
                      ? (seg.liveCount / totalCustomers) * 100
                      : 0;
                  const barPct =
                    maxCount > 0 ? (seg.liveCount / maxCount) * 100 : 0;
                  const watch = AT_RISK_SEGMENTS.has(seg.name);
                  return (
                    <Link
                      key={seg.id}
                      href={`/customers?segment=${encodeURIComponent(seg.name)}`}
                      className="group block rounded-lg px-3 py-2.5 hover:bg-background/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {/* Name + count column */}
                        <div className="w-44 flex-shrink-0 min-w-0">
                          <div className="font-mono text-[12.5px] text-foreground lowercase truncate flex items-center gap-1.5">
                            <span className="truncate">{seg.name}</span>
                            {/* Non-color cue: at-risk cohorts are also labelled,
                                so "watch" never rests on bar opacity alone. */}
                            {watch && (
                              <span className="flex-shrink-0 font-mono text-[9px] uppercase tracking-[0.5px] text-[hsl(var(--accent))] border border-[hsl(var(--accent))]/40 rounded px-1 leading-[1.4]">
                                watch
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                            {seg.liveCount.toLocaleString("en-IN")} ·{" "}
                            {pct.toFixed(0)}%
                          </div>
                        </div>

                        {/* Terminal-style bar. At-risk cohorts read as a hollow
                            (outlined) fill so the distinction survives without
                            relying on a subtle opacity difference. */}
                        <div className="flex-1 h-2 rounded-sm bg-muted/40 overflow-hidden">
                          <div
                            className={`h-full rounded-sm ${
                              watch
                                ? "bg-[hsl(var(--accent))]/30 border border-[hsl(var(--accent))]/60"
                                : "bg-[hsl(var(--accent))]"
                            }`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>

                        {/* Revenue readout */}
                        <div className="w-28 flex-shrink-0 text-right font-mono text-[11.5px] tabular-nums text-foreground">
                          {formatINR(seg.liveRevenue)}
                        </div>

                        <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-[hsl(var(--accent))] transition-colors flex-shrink-0" />
                      </div>
                    </Link>
                  );
                })}

              {/* Empty (zero-count) segments, listed in operator shorthand */}
              {mergedSegments.some((s: any) => s.liveCount === 0) && (
                <div className="pt-3 mt-2 border-t border-border font-mono text-[11px] text-muted-foreground">
                  empty:{" "}
                  {mergedSegments
                    .filter((s: any) => s.liveCount === 0)
                    .map((s: any) => s.name.toLowerCase())
                    .join(" · ")}
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Users className="w-9 h-9 text-muted-foreground/60 mx-auto mb-3" />
              <p className="text-[13px] text-foreground font-sans">
                No segments yet.
              </p>
              <p className="text-[12px] text-muted-foreground font-sans mt-1 max-w-sm mx-auto">
                Connect your store and allo will group your customers as it gets
                to know them.
              </p>
            </div>
          )}
        </ConsoleFrame>
      )}

      {/* Basket Patterns tab */}
      {activeTab === "baskets" && (
        <ConsoleFrame title="allo · basket patterns">
          {basketsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 bg-muted/40 rounded animate-pulse" />
              ))}
            </div>
          ) : baskets && baskets.length > 0 ? (
            <>
              {/* Status line */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-4 mb-4 border-b border-border">
                <MetricReadout label="patterns" value={baskets.length} live />
                <MetricReadout label="top frequency" value={baskets[0].frequency} />
                <MetricReadout
                  label="top customers"
                  value={baskets[0].customerCount}
                />
              </div>

              {/* Warm-voice stream */}
              <StreamOutput aria-label="what allo found in baskets" className="mb-5">
                <StreamRow tick="ok">
                  found <b>{baskets.length}</b> product combinations your
                  customers tend to buy together
                </StreamRow>
                <StreamRow tick="ok">
                  the most common shows up in{" "}
                  <b>{baskets[0].frequency}</b> orders across{" "}
                  <b>{baskets[0].customerCount}</b> customers
                </StreamRow>
              </StreamOutput>

              {/* Basket archetype rows */}
              <div className="space-y-1">
                {baskets.map((basket: any) => {
                  const titles = (basket.productTitles ?? []) as string[];
                  const avgVal = Number(basket.avgOrderValue) || 0;
                  const conf = Number(basket.confidence) || 0;
                  return (
                    <div
                      key={basket.id}
                      className="rounded-lg px-3 py-3 hover:bg-background/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <div className="font-mono text-[12.5px] text-foreground lowercase truncate">
                            {basket.name}
                          </div>
                          <p className="text-[12px] text-muted-foreground font-sans mt-0.5 line-clamp-2">
                            {basket.description}
                          </p>
                        </div>
                        <Link
                          href="/campaigns/new"
                          className="flex-shrink-0 inline-flex items-center gap-1.5 font-mono text-[11px] text-[hsl(var(--accent))] hover:underline"
                        >
                          bundle
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>

                      {/* Product pills */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {titles.map((title: string, idx: number) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-0.5 bg-muted rounded-md font-mono text-[10px] text-foreground"
                          >
                            {title.length > 25 ? title.slice(0, 22) + "…" : title}
                          </span>
                        ))}
                      </div>

                      {/* Mono readouts */}
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                        <MetricReadout label="orders" value={basket.frequency} />
                        <MetricReadout
                          label="customers"
                          value={basket.customerCount}
                        />
                        <MetricReadout label="avg order" value={avgVal} money />
                        <MetricReadout
                          label="confidence"
                          value={`${(conf * 100).toFixed(0)}%`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="py-12 text-center">
              <ShoppingCart className="w-9 h-9 text-muted-foreground/60 mx-auto mb-3" />
              <p className="text-[13px] text-foreground font-sans">
                No basket patterns yet.
              </p>
              <p className="text-[12px] text-muted-foreground font-sans mt-1 max-w-sm mx-auto">
                allo spots the products your customers like to buy together.
                Patterns show up once you have enough multi-item orders.
              </p>
            </div>
          )}
        </ConsoleFrame>
      )}
    </div>
  );
}
