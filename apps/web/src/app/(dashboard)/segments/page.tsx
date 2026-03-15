"use client";

import Link from "next/link";
import { Users, ArrowUpRight, Plus, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Motion variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export default function SegmentsPage() {
  const segmentsQuery = trpc.segments.list.useQuery();
  const distQuery = trpc.segments.distribution.useQuery();
  const segments = segmentsQuery.data as any[] | undefined;
  const distribution = distQuery.data as any[] | undefined;
  const segmentsLoading = segmentsQuery.isLoading;
  const distLoading = distQuery.isLoading;

  const isLoading = segmentsLoading || distLoading;

  // Merge segment definitions with distribution data
  const mergedSegments = (segments ?? []).map((seg: any) => {
    const dist = (distribution ?? []).find((d: any) => d.segment === seg.name);
    return {
      ...seg,
      liveCount: dist?.customerCount ?? seg.customerCount,
      liveRevenue: dist?.totalRevenue ?? seg.totalRevenue,
      avgOrder: dist?.avgOrderValue ?? 0,
    };
  });

  const totalCustomers = mergedSegments.reduce((sum, s) => sum + s.liveCount, 0);

  // Find the largest segment for the insight card
  const largestSegment = mergedSegments.length > 0
    ? mergedSegments.reduce((max, s) => (s.liveCount > max.liveCount ? s : max), mergedSegments[0])
    : null;
  const largestPct = totalCustomers > 0 && largestSegment
    ? ((largestSegment.liveCount / totalCustomers) * 100).toFixed(0)
    : "0";

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="section-header accent-bar-left text-[22px] tracking-[-0.5px] font-bold text-foreground">
            SEGMENTS
          </h1>
          <p className="text-[13px] text-muted-foreground font-sans mt-1">
            {mergedSegments.length > 0 && largestSegment
              ? `${mergedSegments.length} segments — largest: ${largestSegment.name} (${largestSegment.liveCount} customers)`
              : "RFM-based customer segmentation"}
          </p>
        </div>
        <Link
          href="/segments/new"
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-[11px] font-mono hover:bg-secondary/90 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Segment
        </Link>
      </motion.div>

      {/* Segment overview bar */}
      {totalCustomers > 0 && (
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="section-header accent-bar-left text-[13px] font-bold text-foreground">DISTRIBUTION</h2>
          </div>
          <div className="flex rounded-lg overflow-hidden h-10">
            {mergedSegments
              .filter((s) => s.liveCount > 0)
              .map((s, i) => {
                const pct = (s.liveCount / totalCustomers) * 100;
                // Grayscale tones from dark to light
                const shades = [
                  "#111", "#333", "#555", "#777", "#999", "#AAA", "#CCC", "#DDD",
                ];
                return (
                  <div
                    key={s.id}
                    className="relative group flex items-center justify-center"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: shades[i % shades.length],
                      minWidth: pct > 0 ? "2px" : "0",
                    }}
                  >
                    {pct > 8 && (
                      <span className="text-[10px] font-mono font-bold text-white truncate px-1">
                        {s.name}
                      </span>
                    )}
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                      <div className="bg-secondary text-secondary-foreground text-[11px] font-mono p-2 rounded shadow-lg whitespace-nowrap">
                        {s.name}: {s.liveCount} ({pct.toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground font-mono">
            {totalCustomers.toLocaleString()} total customers across{" "}
            {mergedSegments.filter((s) => s.liveCount > 0).length} segments
          </div>
        </motion.div>
      )}

      {/* Segment comparison insight */}
      {totalCustomers > 0 && largestSegment && largestSegment.liveCount > 0 && (
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-terracotta/12 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4 text-terracotta" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-foreground font-sans leading-relaxed">
                {largestSegment.name === "Hibernating" ? (
                  <>
                    {largestPct}% of your customers ({largestSegment.liveCount.toLocaleString()}) are{" "}
                    <span className="font-semibold">{largestSegment.name}</span>. Consider a
                    re-engagement campaign to win them back.
                  </>
                ) : (
                  <>
                    Your largest segment is{" "}
                    <span className="font-semibold">{largestSegment.name}</span> with{" "}
                    {largestSegment.liveCount.toLocaleString()} customers generating $
                    {(largestSegment.liveRevenue / 1000).toFixed(1)}K in revenue.
                  </>
                )}
              </p>
              <Link
                href="/campaigns/new"
                className="inline-flex items-center gap-1.5 mt-2 text-[12px] font-mono font-semibold text-terracotta hover:text-terracotta/80 transition-colors"
              >
                Generate Campaign
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </motion.div>
      )}

      {/* Segment cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="glass-card-static rounded-xl p-6">
                <div className="glass-skeleton h-4 mb-3 w-32" />
                <div className="glass-skeleton h-8 w-20" />
              </div>
            ))
          : mergedSegments.map((seg) =>
              seg.liveCount > 0 ? (
                /* Active segment card */
                <motion.div
                  key={seg.id}
                  variants={itemVariants}
                  className="glass-card rounded-xl p-6 group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-[13px] font-bold text-foreground font-mono">{seg.name}</h3>
                      <p className="text-[11px] text-muted-foreground font-mono mt-1">{seg.description}</p>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-terracotta transition-colors" />
                  </div>
                  <div className="flex items-baseline gap-3 mb-4">
                    <span className="text-[28px] tabular-nums font-bold font-mono text-foreground">
                      {seg.liveCount.toLocaleString()}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">customers</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                    <div>
                      <div className="text-[10px] font-bold tracking-[1px] text-muted-foreground font-mono">REVENUE</div>
                      <div className="text-[13px] font-bold font-mono text-foreground">
                        ${(seg.liveRevenue / 1000).toFixed(1)}K
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold tracking-[1px] text-muted-foreground font-mono">AVG ORDER</div>
                      <div className="text-[13px] font-bold font-mono text-foreground">
                        ${seg.avgOrder.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  {/* RFM range bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono mb-1">
                      <span>RFM {seg.rfmMin}</span>
                      <span>{seg.rfmMax}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full progress-gradient rounded-full"
                        style={{
                          marginLeft: `${(seg.rfmMin / 15) * 100}%`,
                          width: `${((seg.rfmMax - seg.rfmMin) / 15) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  {/* Action links */}
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                    <Link
                      href={`/customers?segment=${encodeURIComponent(seg.name)}`}
                      className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                    >
                      View Customers
                    </Link>
                    <Link
                      href="/campaigns/new"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-terracotta text-white text-[11px] font-mono font-semibold hover:bg-terracotta/90 transition-colors"
                    >
                      Send Campaign
                    </Link>
                  </div>
                </motion.div>
              ) : (
                /* Empty segment card */
                <motion.div
                  key={seg.id}
                  variants={itemVariants}
                  className="glass-card-static rounded-xl p-5 opacity-60"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-[13px] font-bold text-foreground font-mono">{seg.name}</h3>
                      <p className="text-[11px] text-muted-foreground font-mono mt-1">{seg.description}</p>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-3 mb-3">
                    <span className="text-[28px] tabular-nums font-bold font-mono text-foreground">0</span>
                    <span className="text-[11px] text-muted-foreground font-mono">customers</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    No customers match this segment yet
                  </p>
                </motion.div>
              )
            )}
      </motion.div>

      {/* Empty state */}
      {!isLoading && mergedSegments.length === 0 && (
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-16 text-center">
          <Users className="w-10 h-10 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-[13px] font-bold text-foreground font-mono mb-2">NO SEGMENTS YET</h3>
          <p className="text-[11px] text-muted-foreground font-sans max-w-sm mx-auto mb-6">
            Connect a store and run RFM analysis to automatically segment your customers
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 px-4 py-2 bg-terracotta text-white rounded-lg text-[11px] font-mono font-semibold hover:bg-terracotta/90 transition-colors"
          >
            Connect Store
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </motion.div>
      )}
    </motion.div>
  );
}
