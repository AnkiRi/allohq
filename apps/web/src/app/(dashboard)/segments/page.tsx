"use client";

import Link from "next/link";
import { Users, ArrowUpRight, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono">
            SEGMENTS
          </h1>
          <p className="text-[13px] text-muted-foreground font-mono mt-1">
            RFM-based customer segmentation
          </p>
        </div>
        <Link
          href="/segments/new"
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-[11px] font-mono hover:bg-secondary/90 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Segment
        </Link>
      </div>

      {/* Segment overview bar */}
      {totalCustomers > 0 && (
        <div className="border border-border rounded-xl p-6 bg-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-px h-6 bg-secondary" />
            <h2 className="text-[13px] font-bold text-foreground font-mono">DISTRIBUTION</h2>
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
        </div>
      )}

      {/* Segment cards */}
      <div className="grid grid-cols-2 gap-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="border border-border rounded-xl p-6 bg-card">
                <div className="h-4 bg-muted rounded animate-pulse mb-3 w-32" />
                <div className="h-8 bg-muted rounded animate-pulse w-20" />
              </div>
            ))
          : mergedSegments.map((seg) => (
              <div
                key={seg.id}
                className="border border-border rounded-xl p-6 bg-card hover:border-foreground hover:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all duration-200 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-[13px] font-bold text-foreground font-mono">{seg.name}</h3>
                    <p className="text-[11px] text-muted-foreground font-mono mt-1">{seg.description}</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
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
                      className="h-full bg-secondary rounded-full"
                      style={{
                        marginLeft: `${(seg.rfmMin / 15) * 100}%`,
                        width: `${((seg.rfmMax - seg.rfmMin) / 15) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
      </div>

      {/* Empty state */}
      {!isLoading && mergedSegments.length === 0 && (
        <div className="border border-border rounded-xl p-16 bg-card text-center">
          <Users className="w-10 h-10 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-[13px] font-bold text-foreground font-mono mb-2">NO SEGMENTS YET</h3>
          <p className="text-[11px] text-muted-foreground font-mono max-w-sm mx-auto">
            Connect a store and run RFM analysis to automatically segment your customers
          </p>
        </div>
      )}
    </div>
  );
}
