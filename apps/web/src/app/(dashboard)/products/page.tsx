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
        <h1 className="text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono">
          PRODUCTS
        </h1>
        <p className="text-[13px] text-muted-foreground font-mono mt-1">
          Products synced from your store
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by title or vendor..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-[13px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all"
        />
      </div>

      {/* Product table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                Product
              </th>
              <th className="text-left px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                Vendor
              </th>
              <th className="text-left px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                Type
              </th>
              <th className="text-right px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                Price
              </th>
              <th className="text-left px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                Status
              </th>
              <th className="text-right px-5 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">
                Variants
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
            ) : data?.products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <Package className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-[13px] text-muted-foreground font-mono">
                    No products found
                  </p>
                  <p className="text-[11px] text-muted-foreground/50 font-mono mt-1">
                    Sync your store to import products
                  </p>
                </td>
              </tr>
            ) : (
              data?.products.map((product) => (
                <tr
                  key={product.id}
                  className="hover:bg-muted transition-colors"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.title}
                          width={40}
                          height={40}
                          className="w-10 h-10 rounded-lg object-cover border border-border"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <Package className="w-4 h-4 text-muted-foreground/50" />
                        </div>
                      )}
                      <span className="text-[13px] font-medium text-foreground truncate max-w-[250px]">
                        {product.title}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[13px] font-mono text-muted-foreground">
                    {product.vendor ?? "\u2014"}
                  </td>
                  <td className="px-5 py-4 text-[13px] font-mono text-muted-foreground">
                    {product.productType ?? "\u2014"}
                  </td>
                  <td className="px-5 py-4 text-right text-[13px] font-mono font-bold text-foreground">
                    ${product.price.toFixed(2)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-mono ${
                        product.status === "active"
                          ? "bg-green-50 text-green-700"
                          : product.status === "draft"
                            ? "bg-yellow-50 text-yellow-700"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {product.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right text-[13px] font-mono text-muted-foreground">
                    {product.variants.length}
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
              {data.total} products · Page {data.page} of {data.pages}
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
