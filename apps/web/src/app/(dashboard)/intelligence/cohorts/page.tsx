"use client";

import Link from "next/link";
import { ArrowLeft, Users, DollarSign } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function CohortAnalysisPage() {
  const { data: cohorts, isLoading } = trpc.rfm.cohorts.useQuery();

  // Get all unique months across all cohorts for the column headers
  const allMonths = new Set<string>();
  cohorts?.forEach((c) => {
    Object.keys(c.retention).forEach((m) => allMonths.add(m));
  });
  const sortedMonths = Array.from(allMonths).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/intelligence"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 font-mono hover:text-gray-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> BACK TO INTELLIGENCE
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">
          COHORT ANALYSIS
        </h1>
        <p className="text-sm text-gray-400 font-mono mt-1">
          Customers grouped by first purchase month
        </p>
      </div>

      {/* Summary cards */}
      {cohorts && cohorts.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-gray-200 rounded-xl p-5 bg-white">
            <Users className="w-5 h-5 text-gray-300 mb-3" />
            <div className="text-xs text-gray-400 font-mono uppercase tracking-wider mb-1">
              TOTAL COHORTS
            </div>
            <div className="text-2xl font-bold text-gray-900 font-mono">{cohorts.length}</div>
          </div>
          <div className="border border-gray-200 rounded-xl p-5 bg-white">
            <Users className="w-5 h-5 text-gray-300 mb-3" />
            <div className="text-xs text-gray-400 font-mono uppercase tracking-wider mb-1">
              TOTAL CUSTOMERS
            </div>
            <div className="text-2xl font-bold text-gray-900 font-mono">
              {cohorts.reduce((sum, c) => sum + c.customers, 0)}
            </div>
          </div>
          <div className="border border-gray-200 rounded-xl p-5 bg-white">
            <DollarSign className="w-5 h-5 text-gray-300 mb-3" />
            <div className="text-xs text-gray-400 font-mono uppercase tracking-wider mb-1">
              TOTAL REVENUE
            </div>
            <div className="text-2xl font-bold text-gray-900 font-mono">
              ${cohorts.reduce((sum, c) => sum + c.revenue, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      )}

      {/* Cohort table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-px h-5 bg-gray-900" />
          <h2 className="text-sm font-bold text-gray-900 font-mono">COHORT_OVERVIEW</h2>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : cohorts && cohorts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-mono text-gray-400 uppercase sticky left-0 bg-white">
                    Cohort
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-mono text-gray-400 uppercase">
                    Size
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-mono text-gray-400 uppercase">
                    Revenue
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-mono text-gray-400 uppercase">
                    Avg Rev
                  </th>
                  {sortedMonths.map((month) => (
                    <th
                      key={month}
                      className="text-center px-3 py-3 text-[10px] font-mono text-gray-400 uppercase"
                    >
                      {month.slice(2)} {/* Show YY-MM */}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cohorts.map((cohort) => {
                  const avgRevenue = cohort.customers > 0 ? cohort.revenue / cohort.customers : 0;

                  return (
                    <tr key={cohort.month} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono font-bold text-gray-900 sticky left-0 bg-white">
                        {cohort.month}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-gray-700">
                        {cohort.customers}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-bold text-gray-900">
                        ${cohort.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-gray-700">
                        ${avgRevenue.toFixed(0)}
                      </td>
                      {sortedMonths.map((month) => {
                        const activeCount = cohort.retention[month] ?? 0;
                        const pct = cohort.customers > 0 ? (activeCount / cohort.customers) * 100 : 0;
                        const intensity = Math.min(pct / 100, 1);

                        return (
                          <td key={month} className="px-1 py-1 text-center">
                            {activeCount > 0 ? (
                              <div
                                className="mx-auto w-full min-w-[40px] py-2 rounded text-[10px] font-mono font-bold"
                                style={{
                                  backgroundColor: `rgba(0, 0, 0, ${0.05 + intensity * 0.85})`,
                                  color: intensity > 0.4 ? "#fff" : "#111",
                                }}
                              >
                                {pct.toFixed(0)}%
                              </div>
                            ) : (
                              <div className="mx-auto w-full min-w-[40px] py-2 rounded text-[10px] font-mono text-gray-300">
                                —
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-16 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-4" />
            <h3 className="text-sm font-bold text-gray-900 font-mono mb-2">NO COHORT DATA</h3>
            <p className="text-xs text-gray-400 font-mono max-w-sm mx-auto">
              Sync orders and run RFM analysis to generate cohort data
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
