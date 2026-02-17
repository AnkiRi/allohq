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
        <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">
          ORDERS
        </h1>
        <p className="text-sm text-gray-400 font-mono mt-1">
          Orders synced from your store
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by order number or customer..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 focus:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all"
        />
      </div>

      {/* Order table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">
                Order
              </th>
              <th className="text-left px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">
                Customer
              </th>
              <th className="text-right px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">
                Total
              </th>
              <th className="text-right px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">
                Items
              </th>
              <th className="text-left px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading || !store ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-5 py-4">
                    <div className="h-4 bg-gray-100 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : data?.orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <ShoppingCart className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 font-mono">
                    No orders found
                  </p>
                  <p className="text-xs text-gray-300 font-mono mt-1">
                    Sync your store to import orders
                  </p>
                </td>
              </tr>
            ) : (
              data?.orders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-5 py-4">
                    <span className="text-sm font-medium text-gray-900 font-mono">
                      {order.orderNumber}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div>
                      <div className="text-sm text-gray-900">
                        {order.customer.firstName} {order.customer.lastName}
                      </div>
                      <div className="text-xs text-gray-400 font-mono">
                        {order.customer.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right text-sm font-mono font-bold text-gray-900">
                    ${order.totalPrice.toFixed(2)}
                  </td>
                  <td className="px-5 py-4 text-right text-sm font-mono text-gray-500">
                    {order.items.length}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-md text-xs font-mono ${
                        STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm font-mono text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
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
              {data.total} orders · Page {data.page} of {data.pages}
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
