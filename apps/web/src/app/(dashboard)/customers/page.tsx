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
          <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">
            CUSTOMERS
          </h1>
          <p className="text-sm text-gray-400 font-mono mt-1">
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
            className="border border-gray-200 rounded-xl p-5 bg-white hover:border-gray-900 hover:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all duration-200 group"
          >
            <div className="text-xs text-gray-400 font-mono uppercase tracking-wider mb-2">
              {s.label}
            </div>
            <div className="text-2xl font-bold text-gray-900 font-mono">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + segment filter */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 focus:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {SEGMENTS.map((s) => (
            <button
              key={s}
              onClick={() => { setSegment(s); setPage(1); }}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-mono transition-all ${
                segment === s
                  ? "bg-gray-900 text-white"
                  : "bg-white border border-gray-200 text-gray-500 hover:border-gray-400"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Customer table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">Customer</th>
              <th className="text-left px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">Segment</th>
              <th className="text-right px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">Orders</th>
              <th className="text-right px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">Total Spent</th>
              <th className="text-right px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">RFM</th>
              <th className="text-right px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-5 py-4">
                    <div className="h-4 bg-gray-100 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : data?.customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 font-mono">No customers found</p>
                  <p className="text-xs text-gray-300 font-mono mt-1">
                    Connect a store to sync customers
                  </p>
                </td>
              </tr>
            ) : (
              data?.customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="hover:bg-gray-50 transition-colors group"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 font-mono">
                        {(customer.firstName?.[0] ?? customer.email[0] ?? "?").toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {customer.firstName} {customer.lastName}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">{customer.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-block px-2.5 py-1 rounded-md text-xs font-mono bg-gray-100 text-gray-700">
                      {customer.rfmScore?.segment ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right text-sm font-mono text-gray-700">
                    {customer.rfmScore?.orderCount ?? customer._count.orders}
                  </td>
                  <td className="px-5 py-4 text-right text-sm font-mono font-bold text-gray-900">
                    ${(customer.rfmScore?.totalSpent ?? 0).toFixed(2)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="inline-block px-2 py-1 rounded text-xs font-mono font-bold bg-gray-900 text-white">
                      {customer.rfmScore?.totalScore ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ArrowUpRight className="w-4 h-4 text-gray-400" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-400 font-mono">
              {data.total} customers · Page {data.page} of {data.pages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded border border-gray-200 hover:border-gray-400 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
                className="p-1.5 rounded border border-gray-200 hover:border-gray-400 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
