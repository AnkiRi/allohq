"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Users, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

function getSegmentBadgeClass(segment: string | undefined | null): string {
  switch (segment) {
    case "Champions":
      return "bg-olive/10 text-olive border border-olive/20";
    case "Loyal Customers":
      return "bg-warm-gold/10 text-warm-gold border border-warm-gold/20";
    case "Hibernating":
      return "bg-gray-100 text-gray-500 border border-gray-200";
    case "At Risk":
      return "bg-terracotta/10 text-terracotta border border-terracotta/20";
    default:
      return "bg-white/20 text-foreground border border-white/15";
  }
}

function getRfmBadgeClass(score: number | undefined | null): string {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 12) return "bg-olive/15 text-olive";
  if (score >= 8) return "bg-warm-gold/15 text-warm-gold";
  return "bg-muted text-muted-foreground";
}

function isInactiveCustomer(customer: { rfmScore?: { orderCount?: number; totalSpent?: number } | null; _count: { orders: number } }): boolean {
  const orders = customer.rfmScore?.orderCount ?? customer._count.orders;
  const spent = customer.rfmScore?.totalSpent ?? 0;
  return orders === 0 && spent === 0;
}

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

  const marketingValue = stats ? `${stats.marketingRate.toFixed(1)}%` : "—";
  const isMarketingZero = marketingValue === "0.0%";

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
          <h1 className="section-header accent-bar-left text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
            Customers
          </h1>
          <p className="text-[13px] text-muted-foreground font-sans mt-1">
            {stats ? `${stats.totalCustomers.toLocaleString("en-IN")} customers — ${stats.marketingRate.toFixed(0)}% marketing opt-in` : "Everyone who's shopped with you, and where they stand."}
          </p>
        </div>
      </motion.div>

      {/* Stats row */}
      <motion.div variants={itemVariants} className="grid grid-cols-4 gap-4">
        {[
          { label: "TOTAL", value: stats?.totalCustomers?.toLocaleString("en-IN") ?? "—" },
          { label: "MARKETING OPT-IN", value: marketingValue, isMarketing: true },
          { label: "TOTAL REVENUE", value: stats ? `₹${(stats.totalRevenue / 1000).toFixed(1)}K` : "—" },
          { label: "AVG ORDER", value: stats ? `₹${stats.avgOrderValue.toFixed(2)}` : "—" },
        ].map((s, i) => (
          <div
            key={i}
            className="glass-card rounded-xl p-5 transition-all duration-200 group"
          >
            <div className="section-header text-[10px] text-muted-foreground font-sans uppercase font-bold tracking-[1px] mb-2">
              {s.label}
            </div>
            <div className="text-[28px] tabular-nums font-bold font-mono flex items-center gap-2">
              {s.isMarketing && isMarketingZero ? (
                <>
                  <span className="text-[#C44A4A]">{s.value}</span>
                  <AlertTriangle className="w-5 h-5 text-[#C44A4A]" />
                </>
              ) : (
                <span className="text-foreground">{s.value}</span>
              )}
            </div>
          </div>
        ))}
      </motion.div>

      {/* Search + segment filter */}
      <motion.div variants={itemVariants} className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 border border-white/30 bg-white/30 rounded-lg text-[13px] font-sans text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all backdrop-blur-sm"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {SEGMENTS.map((s) => (
            <button
              key={s}
              onClick={() => { setSegment(s); setPage(1); }}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-[11px] font-sans transition-all ${
                segment === s
                  ? "bg-secondary text-secondary-foreground"
                  : "glass-card border-white/20 bg-white/20 text-muted-foreground hover:border-primary/50"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Customer table */}
      <motion.div variants={itemVariants} className="glass-card-static overflow-hidden rounded-xl overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">Customer</th>
              <th className="text-left px-5 py-3 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">Segment</th>
              <th className="text-right px-5 py-3 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">Orders</th>
              <th className="text-right px-5 py-3 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">Total Spent</th>
              <th className="text-right px-5 py-3 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">RFM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-5 py-4">
                    <div className="h-4 glass-skeleton rounded" />
                  </td>
                </tr>
              ))
            ) : data?.customers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-16 text-center">
                  <Users className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-[13px] text-muted-foreground">No customers here yet.</p>
                  <p className="text-[11px] text-muted-foreground/50 mt-1">
                    Connect your store and allo will bring your customers in.
                  </p>
                  <p className="text-[12px] text-muted-foreground/70 font-sans mt-4">
                    Once your data syncs, everyone who&apos;s shopped with you shows up here.
                  </p>
                </td>
              </tr>
            ) : (
              data?.customers.map((customer) => {
                const inactive = isInactiveCustomer(customer);
                return (
                  <tr
                    key={customer.id}
                    className={`glass-row-hover transition-colors group relative${inactive ? " opacity-50" : ""}`}
                  >
                    <td className="px-5 py-4">
                      <Link href={`/customers/${customer.id}`} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground font-sans">
                          {(customer.firstName?.[0] ?? customer.email[0] ?? "?").toUpperCase()}
                        </div>
                        <div>
                          <div className="text-[13px] font-medium text-foreground">
                            {customer.firstName} {customer.lastName}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-sans">{customer.email}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <Link href={`/customers/${customer.id}`}>
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-sans ${getSegmentBadgeClass(customer.rfmScore?.segment)}`}>
                          {customer.rfmScore?.segment ?? "—"}
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-right text-[13px] font-mono text-foreground">
                      <Link href={`/customers/${customer.id}`} className="block">
                        {customer.rfmScore?.orderCount ?? customer._count.orders}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-right text-[13px] font-mono font-bold text-foreground">
                      <Link href={`/customers/${customer.id}`} className="block">
                        ₹{(customer.rfmScore?.totalSpent ?? 0).toFixed(2)}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/customers/${customer.id}`} className="block">
                        <span className={`inline-block px-2 py-1 rounded text-[11px] font-mono font-bold ${getRfmBadgeClass(customer.rfmScore?.totalScore)}`}>
                          {customer.rfmScore?.totalScore ?? "—"}
                        </span>
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-[11px] text-muted-foreground font-sans">
              {data.total} customers · Page {data.page} of {data.pages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded border border-white/30 bg-white/20 hover:bg-white/30 disabled:opacity-30 transition-colors backdrop-blur-sm"
              >
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
                className="p-1.5 rounded border border-white/30 bg-white/20 hover:bg-white/30 disabled:opacity-30 transition-colors backdrop-blur-sm"
              >
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
