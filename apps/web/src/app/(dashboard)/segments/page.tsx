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
          <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">
            SEGMENTS
          </h1>
          <p className="text-sm text-gray-400 font-mono mt-1">
            RFM-based customer segmentation
          </p>
        </div>
        <Link
          href="/segments/new"
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Segment
        </Link>
      </div>

      {/* Segment overview bar */}
      {totalCustomers > 0 && (
        <div className="border border-gray-200 rounded-xl p-6 bg-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-px h-6 bg-gray-900" />
            <h2 className="text-sm font-bold text-gray-900 font-mono">DISTRIBUTION</h2>
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
                      <div className="bg-gray-900 text-white text-xs font-mono p-2 rounded shadow-lg whitespace-nowrap">
                        {s.name}: {s.liveCount} ({pct.toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
          <div className="mt-3 text-xs text-gray-400 font-mono">
            {totalCustomers.toLocaleString()} total customers across{" "}
            {mergedSegments.filter((s) => s.liveCount > 0).length} segments
          </div>
        </div>
      )}

      {/* Segment cards */}
      <div className="grid grid-cols-2 gap-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-6 bg-white">
                <div className="h-4 bg-gray-100 rounded animate-pulse mb-3 w-32" />
                <div className="h-8 bg-gray-100 rounded animate-pulse w-20" />
              </div>
            ))
          : mergedSegments.map((seg) => (
              <div
                key={seg.id}
                className="border border-gray-200 rounded-xl p-6 bg-white hover:border-gray-900 hover:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all duration-200 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 font-mono">{seg.name}</h3>
                    <p className="text-xs text-gray-400 font-mono mt-1">{seg.description}</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-gray-900 transition-colors" />
                </div>
                <div className="flex items-baseline gap-3 mb-4">
                  <span className="text-2xl font-bold font-mono text-gray-900">
                    {seg.liveCount.toLocaleString()}
                  </span>
                  <span className="text-xs text-gray-400 font-mono">customers</span>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                  <div>
                    <div className="text-xs text-gray-400 font-mono">REVENUE</div>
                    <div className="text-sm font-bold font-mono text-gray-900">
                      ${(seg.liveRevenue / 1000).toFixed(1)}K
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 font-mono">AVG ORDER</div>
                    <div className="text-sm font-bold font-mono text-gray-900">
                      ${seg.avgOrder.toFixed(2)}
                    </div>
                  </div>
                </div>
                {/* RFM range bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-[10px] text-gray-400 font-mono mb-1">
                    <span>RFM {seg.rfmMin}</span>
                    <span>{seg.rfmMax}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-900 rounded-full"
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
        <div className="border border-gray-200 rounded-xl p-16 bg-white text-center">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-4" />
          <h3 className="text-sm font-bold text-gray-900 font-mono mb-2">NO SEGMENTS YET</h3>
          <p className="text-xs text-gray-400 font-mono max-w-sm mx-auto">
            Connect a store and run RFM analysis to automatically segment your customers
          </p>
        </div>
      )}
    </div>
  );
}
