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
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> BACK TO INTELLIGENCE
        </Link>
        <h1 className="text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono">
          COHORT ANALYSIS
        </h1>
        <p className="text-[13px] text-muted-foreground font-mono mt-1">
          Customers grouped by first purchase month
        </p>
      </div>

      {/* Summary cards */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border border-border rounded-xl p-5 bg-card">
              <div className="w-5 h-5 bg-muted rounded mb-3 animate-pulse" />
              <div className="w-24 h-3 bg-muted rounded mb-2 animate-pulse" />
              <div className="w-16 h-7 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : cohorts && cohorts.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-border rounded-xl p-5 bg-card">
            <Users className="w-5 h-5 text-muted-foreground/50 mb-3" />
            <div className="text-[10px] text-muted-foreground font-mono uppercase font-bold tracking-[1px] mb-1">
              TOTAL COHORTS
            </div>
            <div className="text-[28px] tabular-nums font-bold text-foreground font-mono">{cohorts.length}</div>
          </div>
          <div className="border border-border rounded-xl p-5 bg-card">
            <Users className="w-5 h-5 text-muted-foreground/50 mb-3" />
            <div className="text-[10px] text-muted-foreground font-mono uppercase font-bold tracking-[1px] mb-1">
              TOTAL CUSTOMERS
            </div>
            <div className="text-[28px] tabular-nums font-bold text-foreground font-mono">
              {cohorts.reduce((sum, c) => sum + c.customers, 0)}
            </div>
          </div>
          <div className="border border-border rounded-xl p-5 bg-card">
            <DollarSign className="w-5 h-5 text-muted-foreground/50 mb-3" />
            <div className="text-[10px] text-muted-foreground font-mono uppercase font-bold tracking-[1px] mb-1">
              TOTAL REVENUE
            </div>
            <div className="text-[28px] tabular-nums font-bold text-foreground font-mono">
              ${cohorts.reduce((sum, c) => sum + c.revenue, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      )}

      {/* Cohort table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <div className="w-px h-5 bg-secondary" />
          <h2 className="text-[13px] font-bold text-foreground font-mono">COHORT_OVERVIEW</h2>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : cohorts && cohorts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase sticky left-0 bg-card">
                    Cohort
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                    Size
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                    Revenue
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                    Avg Rev
                  </th>
                  {sortedMonths.map((month) => (
                    <th
                      key={month}
                      className="text-center px-3 py-3 text-[10px] font-mono text-muted-foreground uppercase"
                    >
                      {month.slice(2)} {/* Show YY-MM */}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cohorts.map((cohort) => {
                  const avgRevenue = cohort.customers > 0 ? cohort.revenue / cohort.customers : 0;

                  return (
                    <tr key={cohort.month} className="hover:bg-muted transition-colors">
                      <td className="px-4 py-3 text-[13px] font-mono font-bold text-foreground sticky left-0 bg-card">
                        {cohort.month}
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-mono text-foreground">
                        {cohort.customers}
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-mono font-bold text-foreground">
                        ${cohort.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-mono text-foreground">
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
                              <div className="mx-auto w-full min-w-[40px] py-2 rounded text-[10px] font-mono text-muted-foreground/50">
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
            <Users className="w-10 h-10 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-[13px] font-bold text-foreground font-mono mb-2">NO COHORT DATA</h3>
            <p className="text-[11px] text-muted-foreground font-mono max-w-sm mx-auto">
              Sync orders and run RFM analysis to generate cohort data
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
