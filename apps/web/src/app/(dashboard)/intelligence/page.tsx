"use client";

import { useState } from "react";
import Link from "next/link";
import { Brain, TrendingUp, Users, DollarSign, AlertTriangle, RefreshCw, Grid3X3, Palette } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function IntelligencePage() {
  const [analyzing, setAnalyzing] = useState(false);

  const { data: rfmData, isLoading: rfmLoading } = trpc.rfm.overview.useQuery();
  const { data: ltvData, isLoading: ltvLoading } = trpc.rfm.ltvOverview.useQuery();
  const { data: stores } = trpc.stores.list.useQuery();

  const utils = trpc.useUtils();
  const calculateRfm = trpc.rfm.calculate.useMutation();
  const calculateLtv = trpc.rfm.calculateLtv.useMutation();

  const storeId = stores?.[0]?.id;

  const isLoading = rfmLoading || ltvLoading;

  async function runAnalysis() {
    if (!storeId || analyzing) return;
    setAnalyzing(true);
    try {
      await calculateRfm.mutateAsync({ storeId });
      await calculateLtv.mutateAsync({ storeId });
      await utils.rfm.overview.invalidate();
      await utils.rfm.ltvOverview.invalidate();
      await utils.segments.list.invalidate();
      await utils.segments.distribution.invalidate();
    } catch (err: any) {
      console.error("Analysis failed:", err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono">
            INTELLIGENCE
          </h1>
          <p className="text-[13px] text-muted-foreground font-mono mt-1">
            Customer intelligence, RFM analysis & lifetime value
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/intelligence/brand"
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-[11px] font-mono text-foreground hover:border-primary/50 transition-all"
          >
            <Palette className="w-3.5 h-3.5" />
            Brand Voice
          </Link>
          <Link
            href="/intelligence/cohorts"
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-[11px] font-mono text-foreground hover:border-primary/50 transition-all"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            Cohort Analysis
          </Link>
          <button
            onClick={runAnalysis}
            disabled={!storeId || analyzing}
            title={!storeId ? "Connect a store first" : ""}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-[11px] font-mono hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? "animate-spin" : ""}`} />
            {!storeId ? "Connect Store First" : analyzing ? "Analyzing..." : "Run Analysis"}
          </button>
        </div>
      </div>

      {/* Top-level KPIs */}
      <div className="grid grid-cols-5 gap-4">
        {[
          {
            icon: Users,
            label: "SCORED",
            value: rfmData?.totalScored?.toLocaleString() ?? "—",
          },
          {
            icon: TrendingUp,
            label: "AVG RFM",
            value: rfmData ? rfmData.avgScores.total.toFixed(1) : "—",
          },
          {
            icon: DollarSign,
            label: "AVG LTV",
            value: ltvData ? `$${ltvData.avgPredictedLtv.toFixed(0)}` : "—",
          },
          {
            icon: DollarSign,
            label: "TOTAL LTV",
            value: ltvData ? `$${(ltvData.totalPredictedLtv / 1000).toFixed(0)}K` : "—",
          },
          {
            icon: AlertTriangle,
            label: "AVG CHURN",
            value: ltvData ? `${(ltvData.avgChurnProbability * 100).toFixed(0)}%` : "—",
          },
        ].map((kpi, i) => (
          <div
            key={i}
            className="border border-border rounded-xl p-5 bg-card hover:border-foreground hover:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all duration-200 group"
          >
            <kpi.icon className="w-5 h-5 text-muted-foreground/50 mb-3 group-hover:text-foreground transition-colors" />
            <div className="text-[10px] text-muted-foreground font-mono uppercase font-bold tracking-[1px] mb-1">
              {kpi.label}
            </div>
            <div className="text-[18px] tracking-[-0.5px] font-bold text-foreground font-mono">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* RFM Averages */}
      <div className="grid grid-cols-2 gap-6">
        <div className="border border-border rounded-xl p-6 bg-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-px h-6 bg-secondary" />
            <h2 className="text-[13px] font-bold text-foreground font-mono tracking-wide">
              RFM_AVERAGES
            </h2>
          </div>
          {rfmData ? (
            <div className="space-y-5">
              {[
                { label: "RECENCY", value: rfmData.avgScores.recency },
                { label: "FREQUENCY", value: rfmData.avgScores.frequency },
                { label: "MONETARY", value: rfmData.avgScores.monetary },
              ].map((dim) => (
                <div key={dim.label}>
                  <div className="flex justify-between text-[11px] font-mono mb-2">
                    <span className="text-muted-foreground">{dim.label}</span>
                    <span className="text-foreground font-bold">{dim.value.toFixed(1)}/5</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-secondary rounded-full transition-all duration-700"
                      style={{ width: `${(dim.value / 5) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground font-mono">No RFM data yet</p>
          )}
        </div>

        {/* LTV Stats */}
        <div className="border border-border rounded-xl p-6 bg-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-px h-6 bg-secondary" />
            <h2 className="text-[13px] font-bold text-foreground font-mono tracking-wide">
              LTV_METRICS
            </h2>
          </div>
          {ltvData ? (
            <div className="space-y-4">
              {[
                { label: "AVG HISTORICAL LTV", value: `$${ltvData.avgHistoricalLtv.toFixed(0)}` },
                { label: "AVG PREDICTED LTV", value: `$${ltvData.avgPredictedLtv.toFixed(0)}` },
                { label: "AVG ORDER VALUE", value: `$${ltvData.avgOrderValue.toFixed(2)}` },
                { label: "PURCHASE FREQUENCY", value: `${ltvData.avgPurchaseFrequency.toFixed(2)}/mo` },
                { label: "AVG CHURN RISK", value: `${(ltvData.avgChurnProbability * 100).toFixed(1)}%` },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <span className="text-[11px] text-muted-foreground font-mono">{stat.label}</span>
                  <span className="text-[13px] font-bold text-foreground font-mono">{stat.value}</span>
                </div>
              ))}
            </div>
          ) : isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-6 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground font-mono">No LTV data yet</p>
          )}
        </div>
      </div>

      {/* Segment breakdown */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Brain className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[13px] font-bold text-foreground font-mono">SEGMENT_BREAKDOWN</h2>
        </div>
        {rfmData && rfmData.segments.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Segment</th>
                <th className="text-right px-6 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Customers</th>
                <th className="text-right px-6 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Revenue</th>
                <th className="text-right px-6 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Avg Order</th>
                <th className="text-right px-6 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Avg Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rfmData.segments
                .sort((a, b) => b.avgScore - a.avgScore)
                .map((seg) => {
                  const maxCount = Math.max(...rfmData.segments.map((s) => s.count));
                  return (
                    <tr key={seg.name} className="hover:bg-muted transition-colors">
                      <td className="px-6 py-3">
                        <span className="text-[13px] font-bold text-foreground font-mono">
                          {seg.name}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-secondary rounded-full"
                              style={{ width: `${(seg.count / maxCount) * 100}%` }}
                            />
                          </div>
                          <span className="text-[13px] font-mono text-foreground w-12 text-right">
                            {seg.count}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right text-[13px] font-mono font-bold text-foreground">
                        ${(seg.revenue / 1000).toFixed(1)}K
                      </td>
                      <td className="px-6 py-3 text-right text-[13px] font-mono text-foreground">
                        ${seg.avgOrderValue.toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="inline-block px-2 py-0.5 bg-secondary text-secondary-foreground text-[11px] font-mono font-bold rounded">
                          {seg.avgScore.toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        ) : isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="p-16 text-center">
            <Brain className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-[13px] text-muted-foreground font-mono">No segment data yet</p>
            <p className="text-[11px] text-muted-foreground/50 font-mono mt-1">
              Click &quot;Run Analysis&quot; to generate insights
            </p>
          </div>
        )}
      </div>

      {/* Top customers */}
      {rfmData && rfmData.topCustomers.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-bold text-foreground font-mono">TOP_CUSTOMERS</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">#</th>
                <th className="text-left px-6 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Customer</th>
                <th className="text-left px-6 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Segment</th>
                <th className="text-right px-6 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Score</th>
                <th className="text-right px-6 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Spent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rfmData.topCustomers.map((tc, i) => (
                <tr key={tc.id} className="hover:bg-muted transition-colors">
                  <td className="px-6 py-3 text-[11px] font-mono text-muted-foreground">{i + 1}</td>
                  <td className="px-6 py-3">
                    <div className="text-[13px] font-medium text-foreground">
                      {tc.customer.firstName} {tc.customer.lastName}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">{tc.customer.email}</div>
                  </td>
                  <td className="px-6 py-3">
                    <span className="px-2 py-0.5 bg-muted text-foreground text-[11px] font-mono rounded">
                      {tc.segment}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="px-2 py-0.5 bg-secondary text-secondary-foreground text-[11px] font-mono font-bold rounded">
                      {tc.totalScore}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-[13px] font-mono font-bold text-foreground">
                    ${tc.totalSpent.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
