"use client";

import { useState } from "react";
import Image from "next/image";
import { Search, Package, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: stores } = trpc.stores.list.useQuery();
  const store = stores?.[0]; // Use first active store

  const { data, isLoading } = trpc.stores.products.useQuery(
    { storeId: store?.id ?? "", page, limit: 20, search: search || undefined },
    { enabled: !!store?.id }
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">
          PRODUCTS
        </h1>
        <p className="text-sm text-gray-400 font-mono mt-1">
          Products synced from your store
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by title or vendor..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 focus:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all"
        />
      </div>

      {/* Product table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">
                Product
              </th>
              <th className="text-left px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">
                Vendor
              </th>
              <th className="text-left px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="text-right px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">
                Price
              </th>
              <th className="text-left px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="text-right px-5 py-3 text-xs font-mono text-gray-400 uppercase tracking-wider">
                Variants
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
            ) : data?.products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <Package className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 font-mono">
                    No products found
                  </p>
                  <p className="text-xs text-gray-300 font-mono mt-1">
                    Sync your store to import products
                  </p>
                </td>
              </tr>
            ) : (
              data?.products.map((product) => (
                <tr
                  key={product.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.title}
                          width={40}
                          height={40}
                          className="w-10 h-10 rounded-lg object-cover border border-gray-100"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                          <Package className="w-4 h-4 text-gray-300" />
                        </div>
                      )}
                      <span className="text-sm font-medium text-gray-900 truncate max-w-[250px]">
                        {product.title}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm font-mono text-gray-500">
                    {product.vendor ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-sm font-mono text-gray-500">
                    {product.productType ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-right text-sm font-mono font-bold text-gray-900">
                    ${product.price.toFixed(2)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-md text-xs font-mono ${
                        product.status === "active"
                          ? "bg-green-50 text-green-700"
                          : product.status === "draft"
                            ? "bg-yellow-50 text-yellow-700"
                            : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {product.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right text-sm font-mono text-gray-500">
                    {product.variants.length}
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
              {data.total} products · Page {data.page} of {data.pages}
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
