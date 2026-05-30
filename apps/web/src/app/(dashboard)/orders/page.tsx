"use client";

import { useState } from "react";
import {
  Search,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-50 text-green-700",
  fulfilled: "bg-blue-50 text-blue-700",
  pending: "bg-yellow-50 text-yellow-700",
  cancelled: "bg-red-50 text-red-700",
};

export default function OrdersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: stores } = trpc.stores.list.useQuery();
  const store = stores?.[0];

  const { data, isLoading } = trpc.stores.orders.useQuery(
    { storeId: store?.id ?? "", page, limit: 20, search: search || undefined },
    { enabled: !!store?.id }
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
          Orders
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Orders synced from your store
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by order number or customer..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-[13px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all"
        />
      </div>

      {/* Order table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                Order
              </th>
              <th className="text-left px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                Customer
              </th>
              <th className="text-right px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                Total
              </th>
              <th className="text-right px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                Items
              </th>
              <th className="text-left px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                Status
              </th>
              <th className="text-left px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading || !store ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-5 py-4">
                    <div className="h-4 bg-muted rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : data?.orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <ShoppingCart className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-[13px] text-muted-foreground">
                    No orders found
                  </p>
                  <p className="text-[11px] text-muted-foreground/50 mt-1">
                    Sync your store to import orders
                  </p>
                </td>
              </tr>
            ) : (
              data?.orders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-muted transition-colors"
                >
                  <td className="px-5 py-4">
                    <span className="text-[13px] font-medium text-foreground font-mono">
                      {order.orderNumber}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div>
                      <div className="text-[13px] text-foreground">
                        {order.customer.firstName} {order.customer.lastName}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {order.customer.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right text-[13px] font-mono font-bold text-foreground">
                    ${order.totalPrice.toFixed(2)}
                  </td>
                  <td className="px-5 py-4 text-right text-[13px] font-mono text-muted-foreground">
                    {order.items.length}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-mono ${
                        STATUS_COLORS[order.status] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[13px] font-mono text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString()}
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
              {data.total} orders · Page {data.page} of {data.pages}
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
