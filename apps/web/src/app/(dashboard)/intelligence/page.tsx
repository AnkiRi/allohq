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
          <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">
            INTELLIGENCE
          </h1>
          <p className="text-sm text-gray-400 font-mono mt-1">
            Customer intelligence, RFM analysis & lifetime value
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/intelligence/brand"
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 hover:border-gray-400 transition-all"
          >
            <Palette className="w-3.5 h-3.5" />
            Brand Voice
          </Link>
          <Link
            href="/intelligence/cohorts"
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 hover:border-gray-400 transition-all"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            Cohort Analysis
          </Link>
          <button
            onClick={runAnalysis}
            disabled={!storeId || analyzing}
            title={!storeId ? "Connect a store first" : ""}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
            className="border border-gray-200 rounded-xl p-5 bg-white hover:border-gray-900 hover:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all duration-200 group"
          >
            <kpi.icon className="w-5 h-5 text-gray-300 mb-3 group-hover:text-gray-900 transition-colors" />
            <div className="text-xs text-gray-400 font-mono uppercase tracking-wider mb-1">
              {kpi.label}
            </div>
            <div className="text-xl font-bold text-gray-900 font-mono">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* RFM Averages */}
      <div className="grid grid-cols-2 gap-6">
        <div className="border border-gray-200 rounded-xl p-6 bg-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-px h-6 bg-gray-900" />
            <h2 className="text-sm font-bold text-gray-900 font-mono tracking-wide">
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
                  <div className="flex justify-between text-xs font-mono mb-2">
                    <span className="text-gray-400">{dim.label}</span>
                    <span className="text-gray-900 font-bold">{dim.value.toFixed(1)}/5</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-900 rounded-full transition-all duration-700"
                      style={{ width: `${(dim.value / 5) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 font-mono">No RFM data yet</p>
          )}
        </div>

        {/* LTV Stats */}
        <div className="border border-gray-200 rounded-xl p-6 bg-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-px h-6 bg-gray-900" />
            <h2 className="text-sm font-bold text-gray-900 font-mono tracking-wide">
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
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                >
                  <span className="text-xs text-gray-400 font-mono">{stat.label}</span>
                  <span className="text-sm font-bold text-gray-900 font-mono">{stat.value}</span>
                </div>
              ))}
            </div>
          ) : isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 font-mono">No LTV data yet</p>
          )}
        </div>
      </div>

      {/* Segment breakdown */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <Brain className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-bold text-gray-900 font-mono">SEGMENT_BREAKDOWN</h2>
        </div>
        {rfmData && rfmData.segments.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="text-left px-6 py-3 text-xs font-mono text-gray-400 uppercase">Segment</th>
                <th className="text-right px-6 py-3 text-xs font-mono text-gray-400 uppercase">Customers</th>
                <th className="text-right px-6 py-3 text-xs font-mono text-gray-400 uppercase">Revenue</th>
                <th className="text-right px-6 py-3 text-xs font-mono text-gray-400 uppercase">Avg Order</th>
                <th className="text-right px-6 py-3 text-xs font-mono text-gray-400 uppercase">Avg Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rfmData.segments
                .sort((a, b) => b.avgScore - a.avgScore)
                .map((seg) => {
                  const maxCount = Math.max(...rfmData.segments.map((s) => s.count));
                  return (
                    <tr key={seg.name} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3">
                        <span className="text-sm font-bold text-gray-900 font-mono">
                          {seg.name}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gray-900 rounded-full"
                              style={{ width: `${(seg.count / maxCount) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-mono text-gray-700 w-12 text-right">
                            {seg.count}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-mono font-bold text-gray-900">
                        ${(seg.revenue / 1000).toFixed(1)}K
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-mono text-gray-700">
                        ${seg.avgOrderValue.toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="inline-block px-2 py-0.5 bg-gray-900 text-white text-xs font-mono font-bold rounded">
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
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="p-16 text-center">
            <Brain className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400 font-mono">No segment data yet</p>
            <p className="text-xs text-gray-300 font-mono mt-1">
              Click &quot;Run Analysis&quot; to generate insights
            </p>
          </div>
        )}
      </div>

      {/* Top customers */}
      {rfmData && rfmData.topCustomers.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-bold text-gray-900 font-mono">TOP_CUSTOMERS</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="text-left px-6 py-3 text-xs font-mono text-gray-400 uppercase">#</th>
                <th className="text-left px-6 py-3 text-xs font-mono text-gray-400 uppercase">Customer</th>
                <th className="text-left px-6 py-3 text-xs font-mono text-gray-400 uppercase">Segment</th>
                <th className="text-right px-6 py-3 text-xs font-mono text-gray-400 uppercase">Score</th>
                <th className="text-right px-6 py-3 text-xs font-mono text-gray-400 uppercase">Spent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rfmData.topCustomers.map((tc, i) => (
                <tr key={tc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-xs font-mono text-gray-400">{i + 1}</td>
                  <td className="px-6 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {tc.customer.firstName} {tc.customer.lastName}
                    </div>
                    <div className="text-xs text-gray-400 font-mono">{tc.customer.email}</div>
                  </td>
                  <td className="px-6 py-3">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-mono rounded">
                      {tc.segment}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="px-2 py-0.5 bg-gray-900 text-white text-xs font-mono font-bold rounded">
                      {tc.totalScore}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-sm font-mono font-bold text-gray-900">
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
