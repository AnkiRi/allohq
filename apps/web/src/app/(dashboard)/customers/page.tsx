"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Users, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

const SEGMENTS = [
  "All",
  "Champions",
  "Loyal Customers",
  "Potential Loyalists",
  "New Customers",
  "At Risk",
  "Can't Lose Them",
  "Hibernating",
  "Lost",
];

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("All");
  const [page, setPage] = useState(1);

  const { data: stats } = trpc.customers.stats.useQuery();
  const { data, isLoading } = trpc.customers.list.useQuery({
    page,
    limit: 20,
    search: search || undefined,
    segment: segment === "All" ? undefined : segment,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono">
            CUSTOMERS
          </h1>
          <p className="text-[13px] text-muted-foreground font-mono mt-1">
            Customer intelligence & segmentation
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "TOTAL", value: stats?.totalCustomers?.toLocaleString() ?? "—" },
          { label: "MARKETING OPT-IN", value: stats ? `${stats.marketingRate.toFixed(1)}%` : "—" },
          { label: "TOTAL REVENUE", value: stats ? `$${(stats.totalRevenue / 1000).toFixed(1)}K` : "—" },
          { label: "AVG ORDER", value: stats ? `$${stats.avgOrderValue.toFixed(2)}` : "—" },
        ].map((s, i) => (
          <div
            key={i}
            className="border border-border rounded-xl p-5 bg-card hover:border-foreground hover:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all duration-200 group"
          >
            <div className="text-[10px] text-muted-foreground font-mono uppercase font-bold tracking-[1px] mb-2">
              {s.label}
            </div>
            <div className="text-[28px] tabular-nums font-bold text-foreground font-mono">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + segment filter */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-[13px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {SEGMENTS.map((s) => (
            <button
              key={s}
              onClick={() => { setSegment(s); setPage(1); }}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-[11px] font-mono transition-all ${
                segment === s
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Customer table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Customer</th>
              <th className="text-left px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Segment</th>
              <th className="text-right px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Orders</th>
              <th className="text-right px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Total Spent</th>
              <th className="text-right px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">RFM</th>
              <th className="text-right px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-5 py-4">
                    <div className="h-4 bg-muted rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : data?.customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <Users className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-[13px] text-muted-foreground font-mono">No customers found</p>
                  <p className="text-[11px] text-muted-foreground/50 font-mono mt-1">
                    Connect a store to sync customers
                  </p>
                </td>
              </tr>
            ) : (
              data?.customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="hover:bg-muted transition-colors group"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground font-mono">
                        {(customer.firstName?.[0] ?? customer.email[0] ?? "?").toUpperCase()}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium text-foreground">
                          {customer.firstName} {customer.lastName}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">{customer.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-mono bg-muted text-foreground">
                      {customer.rfmScore?.segment ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right text-[13px] font-mono text-foreground">
                    {customer.rfmScore?.orderCount ?? customer._count.orders}
                  </td>
                  <td className="px-5 py-4 text-right text-[13px] font-mono font-bold text-foreground">
                    ${(customer.rfmScore?.totalSpent ?? 0).toFixed(2)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="inline-block px-2 py-1 rounded text-[11px] font-mono font-bold bg-secondary text-secondary-foreground">
                      {customer.rfmScore?.totalScore ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-[11px] text-muted-foreground font-mono">
              {data.total} customers · Page {data.page} of {data.pages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded border border-border hover:border-primary/50 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
                className="p-1.5 rounded border border-border hover:border-primary/50 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
