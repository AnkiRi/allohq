"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  DollarSign,
  TrendingUp,
  Sparkles,
  ChevronDown,
  Calendar,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";

/* ------------------------------------------------------------------ */
/*  Motion variants                                                    */
/* ------------------------------------------------------------------ */

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

/* ------------------------------------------------------------------ */
/*  CohortAreaChart — inline SVG area chart                            */
/* ------------------------------------------------------------------ */

function CohortAreaChart({ data }: { data: { label: string; value: number }[] }) {
  if (!data.length) return null;

  // Single data point — render a centered bar
  if (data.length === 1) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <svg viewBox="0 0 600 200" className="w-full" preserveAspectRatio="xMidYMid meet">
          <rect
            x={260}
            y={40}
            width={80}
            height={140}
            rx={6}
            fill="hsl(var(--accent) / 0.15)"
            stroke="var(--color-accent)"
            strokeWidth={2}
          />
          <text
            x={300}
            y={30}
            textAnchor="middle"
            className="fill-foreground"
            fontSize={13}
            fontFamily="monospace"
          >
            ₹{data[0]!.value.toLocaleString()}
          </text>
          <text
            x={300}
            y={198}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={11}
            fontFamily="monospace"
          >
            {data[0]!.label}
          </text>
        </svg>
      </div>
    );
  }

  const W = 600;
  const H = 200;
  const padX = 50;
  const padTop = 20;
  const padBottom = 30;
  const chartW = W - padX * 2;
  const chartH = H - padTop - padBottom;

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  const points = data.map((d, i) => ({
    x: padX + (i / (data.length - 1)) * chartW,
    y: padTop + chartH - (d.value / maxVal) * chartH,
    label: d.label,
    value: d.value,
  }));

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = `M${points[0]!.x},${padTop + chartH} L${points.map((p) => `${p.x},${p.y}`).join(" L")} L${points[points.length - 1]!.x},${padTop + chartH} Z`;

  return (
    <div className="relative">
      <style>{`
        @keyframes reveal {
          from { clip-path: inset(0 100% 0 0); }
          to   { clip-path: inset(0 0 0 0); }
        }
        .chart-reveal { animation: reveal 800ms ease-out forwards; }
      `}</style>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full chart-reveal" preserveAspectRatio="xMidYMid meet">
        {/* Area fill */}
        <path d={areaPath} fill="hsl(var(--accent) / 0.15)" />

        {/* Stroke line */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--color-accent)" />
        ))}

        {/* X-axis labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={H - 4}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={10}
            fontFamily="monospace"
          >
            {p.label.slice(2)}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Segment color mapping                                              */
/* ------------------------------------------------------------------ */

// Segment swatches resolve per palette via V2 tokens (success / warning /
// urgent / accent), so the legend wears the active theme rather than fixed hex.
const SEGMENT_COLORS: Record<string, string> = {
  Champions: "var(--color-success)",
  "Loyal Customers": "var(--color-warning)",
  "Potential Loyalists": "var(--color-accent)",
  "New Customers": "hsl(var(--muted-foreground))",
  "At Risk": "var(--color-urgent)",
  Hibernating: "hsl(var(--muted-foreground) / 0.6)",
  Unscored: "hsl(var(--muted-foreground) / 0.35)",
};
const SEGMENT_FALLBACK = "hsl(var(--muted-foreground) / 0.6)";

/* ------------------------------------------------------------------ */
/*  CohortDetailPanel — expanded row detail                            */
/* ------------------------------------------------------------------ */

function CohortDetailPanel({ month }: { month: string }) {
  const { data, isLoading } = trpc.rfm.cohortDetail.useQuery({ month });

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-6 p-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-skeleton h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-[11px] text-muted-foreground font-sans">
        Nothing more to show for this cohort yet.
      </div>
    );
  }

  const { topCustomers, segmentDistribution, purchaseStats } = data;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="border-t border-border/50 bg-muted/20"
    >
      <div className="grid grid-cols-3 gap-6 p-6">
        {/* Column 1 — Top Customers */}
        <div>
          <div className="text-[10px] text-muted-foreground font-sans uppercase font-bold tracking-[1px] mb-3">
            TOP CUSTOMERS
          </div>
          <div className="space-y-3">
            {topCustomers.slice(0, 3).map((tc, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[13px] text-foreground font-sans">{tc.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    ₹{tc.revenue.toLocaleString()} &middot; {tc.orders} orders
                  </div>
                </div>
                <span
                  className="shrink-0 px-2 py-0.5 rounded text-[9px] font-sans font-bold"
                  style={{
                    color: SEGMENT_COLORS[tc.segment] ?? SEGMENT_FALLBACK,
                    backgroundColor: `color-mix(in srgb, ${SEGMENT_COLORS[tc.segment] ?? SEGMENT_FALLBACK} 16%, transparent)`,
                  }}
                >
                  {tc.segment}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2 — Segment Distribution */}
        <div>
          <div className="text-[10px] text-muted-foreground font-sans uppercase font-bold tracking-[1px] mb-3">
            SEGMENTS
          </div>
          {/* Stacked horizontal bar */}
          <div className="flex h-2 rounded-full overflow-hidden mb-3">
            {segmentDistribution.map((seg) => (
              <div
                key={seg.segment}
                style={{
                  width: `${seg.pct}%`,
                  backgroundColor: SEGMENT_COLORS[seg.segment] ?? SEGMENT_FALLBACK,
                }}
              />
            ))}
          </div>
          {/* Legend */}
          <div className="space-y-1.5">
            {segmentDistribution.map((seg) => (
              <div key={seg.segment} className="flex items-center gap-2 text-[11px]">
                <span
                  className="block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: SEGMENT_COLORS[seg.segment] ?? SEGMENT_FALLBACK }}
                />
                <span className="text-foreground font-sans">{seg.segment}</span>
                <span className="text-muted-foreground font-mono ml-auto">
                  {seg.count} ({seg.pct.toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Column 3 — Purchase Behavior */}
        <div>
          <div className="text-[10px] text-muted-foreground font-sans uppercase font-bold tracking-[1px] mb-3">
            PURCHASE STATS
          </div>
          <div className="space-y-3">
            {[
              { label: "Avg Orders", value: purchaseStats.avgOrders.toFixed(1) },
              { label: "Avg Order Value", value: `₹${purchaseStats.avgOrderValue.toFixed(0)}` },
              { label: "Repeat Rate", value: `${(purchaseStats.repeatRate * 100).toFixed(0)}%` },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
              >
                <span className="text-[11px] text-muted-foreground font-sans">{stat.label}</span>
                <span className="text-[13px] font-bold text-foreground font-mono">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCurrency(n: number): string {
  return "₹" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function getNextMonths(count: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(
      d.toLocaleDateString("en-US", { year: "numeric", month: "long" })
    );
  }
  return months;
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function CohortAnalysisPage() {
  const { data: cohorts, isLoading } = trpc.rfm.cohorts.useQuery();
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  // Compute all unique retention months for column headers
  const allMonths = new Set<string>();
  cohorts?.forEach((c) => {
    Object.keys(c.retention).forEach((m) => allMonths.add(m));
  });
  const sortedMonths = Array.from(allMonths).sort();

  // Aggregate metrics
  const totalCohorts = cohorts?.length ?? 0;
  const totalCustomers = cohorts?.reduce((sum, c) => sum + c.customers, 0) ?? 0;
  const totalRevenue = cohorts?.reduce((sum, c) => sum + c.revenue, 0) ?? 0;
  const avgRevPerCustomer = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

  // AI insight computation
  const bestCohort = cohorts?.length
    ? cohorts.reduce((best, c) => (c.revenue > best.revenue ? c : best), cohorts[0]!)
    : null;
  const retentionMultiplier = bestCohort
    ? Object.values(bestCohort.retention).reduce((sum, v) => sum + v, 0) /
      Math.max(bestCohort.customers, 1)
    : 0;

  // Future cohort labels
  const futureMonths = getNextMonths(2);

  // Chart data
  const chartData = cohorts?.map((c) => ({ label: c.month, value: c.revenue })) ?? [];

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ============================================================ */}
      {/*  HEADER                                                       */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants} className="glass-card-static p-6">
        <Link
          href="/intelligence"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-sans hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to intelligence
        </Link>
        <h1 className="section-header accent-bar-left text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
          Cohort analysis
        </h1>
        <p className="text-[13px] text-muted-foreground font-sans mt-1 pl-4">
          Your customers grouped by the month they first bought from you.
        </p>
      </motion.div>

      {/* ============================================================ */}
      {/*  METRIC CARDS                                                 */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants} className="grid grid-cols-4 gap-4">
        {[
          {
            icon: Calendar,
            label: "TOTAL COHORTS",
            value: isLoading ? null : totalCohorts.toString(),
          },
          {
            icon: Users,
            label: "TOTAL CUSTOMERS",
            value: isLoading ? null : totalCustomers.toLocaleString(),
          },
          {
            icon: DollarSign,
            label: "TOTAL REVENUE",
            value: isLoading ? null : formatCurrency(totalRevenue),
          },
          {
            icon: TrendingUp,
            label: "AVG REV / CUSTOMER",
            value: isLoading ? null : formatCurrency(avgRevPerCustomer),
          },
        ].map((kpi) => (
          <div key={kpi.label} className="glass-card p-4 group">
            <kpi.icon className="w-4 h-4 text-muted-foreground/50 mb-2 group-hover:text-foreground transition-colors" />
            <div className="text-[10px] text-muted-foreground font-sans uppercase font-bold tracking-[1px] mb-1">
              {kpi.label}
            </div>
            {kpi.value === null ? (
              <div className="glass-skeleton h-5 w-16 mt-1" />
            ) : (
              <div className="text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono tabular-nums">
                {kpi.value}
              </div>
            )}
          </div>
        ))}
      </motion.div>

      {/* ============================================================ */}
      {/*  AI INSIGHT CARD                                              */}
      {/* ============================================================ */}
      {cohorts && cohorts.length > 0 && bestCohort && (
        <motion.div
          variants={itemVariants}
          className="glass-card-static p-6 border-l-4 border-l-[var(--color-accent)]"
        >
          <div className="flex gap-4">
            <Sparkles className="w-5 h-5 text-[var(--color-accent)] shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[13px] text-foreground/90 font-sans leading-relaxed">
                Your <span className="font-bold">{bestCohort.month}</span> cohort is your strongest,
                spending <span className="font-mono font-bold">{retentionMultiplier.toFixed(1)}x</span> the
                usual. Those {bestCohort.customers} customers have brought in{" "}
                <span className="font-mono font-bold">{formatCurrency(bestCohort.revenue)}</span>.
                Worth going after more shoppers like them.
              </p>
              <div className="flex items-center gap-4 mt-3">
                <Link
                  href="/segments"
                  className="text-[11px] font-sans text-[var(--color-accent)] hover:underline"
                >
                  View Segments &rarr;
                </Link>
                <Link
                  href="/campaigns"
                  className="text-[11px] font-sans text-[var(--color-accent)] hover:underline"
                >
                  Create Campaign &rarr;
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ============================================================ */}
      {/*  COHORT REVENUE CHART                                         */}
      {/* ============================================================ */}
      {cohorts && cohorts.length > 0 && (
        <motion.div variants={itemVariants} className="glass-card-static p-6">
          <h2 className="section-header accent-bar-left text-[13px] text-foreground mb-6">
            Revenue by cohort over time
          </h2>
          <CohortAreaChart data={chartData} />
          {bestCohort && (
            <p className="text-[11px] text-muted-foreground mt-4 text-center">
              {bestCohort.month}: {bestCohort.customers} customers have brought in{" "}
              {formatCurrency(bestCohort.revenue)}
            </p>
          )}
        </motion.div>
      )}

      {/* ============================================================ */}
      {/*  COHORT TABLE                                                 */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants} className="glass-card-static overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50 flex items-center gap-3">
          <div className="w-px h-5 bg-secondary" />
          <h2 className="text-[13px] font-bold text-foreground font-serif">Cohort overview</h2>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass-skeleton h-10 rounded" />
            ))}
          </div>
        ) : cohorts && cohorts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {/* Expand toggle column */}
                  <th className="w-8 px-2 py-3" />
                  <th className="text-left px-4 py-3 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase sticky left-0 bg-transparent">
                    Cohort
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">
                    Size
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">
                    Revenue
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">
                    Avg Rev
                  </th>
                  {sortedMonths.map((month) => (
                    <th
                      key={month}
                      className="text-center px-3 py-3 text-[10px] font-sans text-muted-foreground uppercase"
                    >
                      {month.slice(2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort) => {
                  const avgRevenue =
                    cohort.customers > 0 ? cohort.revenue / cohort.customers : 0;
                  const isExpanded = expandedMonth === cohort.month;

                  return (
                    <React.Fragment key={cohort.month}>
                      <tr
                        className="glass-row-hover transition-colors cursor-pointer border-b border-border/50"
                        onClick={() =>
                          setExpandedMonth(isExpanded ? null : cohort.month)
                        }
                      >
                        <td className="w-8 px-2 py-3 text-center">
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3 text-[13px] font-mono font-bold text-foreground">
                          {cohort.month}
                        </td>
                        <td className="px-4 py-3 text-right text-[13px] font-mono tabular-nums text-foreground">
                          {cohort.customers}
                        </td>
                        <td className="px-4 py-3 text-right text-[13px] font-mono tabular-nums font-bold text-foreground">
                          {formatCurrency(cohort.revenue)}
                        </td>
                        <td className="px-4 py-3 text-right text-[13px] font-mono tabular-nums text-foreground">
                          {formatCurrency(avgRevenue)}
                        </td>
                        {sortedMonths.map((month) => {
                          const activeCount = cohort.retention[month] ?? 0;
                          const pct =
                            cohort.customers > 0
                              ? (activeCount / cohort.customers) * 100
                              : 0;
                          const intensity = Math.min(pct / 100, 1);
                          const multiplier = (pct / 100).toFixed(1);

                          // Heatmap color based on retention percentage —
                          // V2 tokens (success / warning / urgent), per palette.
                          const alpha = 0.15 + intensity * 0.6;
                          let bgColor: string;
                          if (pct > 100) {
                            bgColor = `color-mix(in srgb, var(--color-success) ${alpha * 100}%, transparent)`;
                          } else if (pct >= 50) {
                            bgColor = `color-mix(in srgb, var(--color-warning) ${alpha * 100}%, transparent)`;
                          } else {
                            bgColor = `color-mix(in srgb, var(--color-urgent) ${alpha * 100}%, transparent)`;
                          }

                          return (
                            <td key={month} className="px-1 py-1 text-center">
                              {activeCount > 0 ? (
                                <div
                                  className="mx-auto w-full min-w-[44px] py-1.5 rounded"
                                  style={{ backgroundColor: bgColor }}
                                  title={`This cohort has spent ${multiplier}x their first-month revenue`}
                                >
                                  <div className="text-[10px] font-mono font-bold text-foreground">
                                    {pct.toFixed(0)}%
                                  </div>
                                  <div className="text-[9px] font-mono text-muted-foreground">
                                    {multiplier}x
                                  </div>
                                </div>
                              ) : (
                                <div className="mx-auto w-full min-w-[44px] py-2 rounded text-[10px] font-mono text-muted-foreground/50">
                                  ·
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>

                      {/* Expanded detail panel */}
                      <tr>
                        <td colSpan={5 + sortedMonths.length} className="p-0">
                          <AnimatePresence>
                            {isExpanded && <CohortDetailPanel month={cohort.month} />}
                          </AnimatePresence>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}

                {/* -------------------------------------------------- */}
                {/*  FUTURE COHORT ROWS                                 */}
                {/* -------------------------------------------------- */}
                {futureMonths.map((monthName, i) => (
                  <tr key={`future-${i}`} className="opacity-40">
                    <td className="w-8 px-2 py-3" />
                    <td
                      colSpan={4 + sortedMonths.length}
                      className="px-4 py-3 text-[12px] font-sans text-muted-foreground italic"
                    >
                      {i === 0
                        ? `A new cohort opens here once buyers arrive in ${monthName}`
                        : `${monthName} \u2014 still to come`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Empty state */
          <div className="p-16 text-center">
            <div className="glass-card-static inline-flex p-4 rounded-full mb-4">
              <Users className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-[13px] font-bold text-foreground font-serif mb-2">
              No cohorts yet
            </h3>
            <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
              Sync your orders and run an analysis. allo will build your cohorts from there.
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
