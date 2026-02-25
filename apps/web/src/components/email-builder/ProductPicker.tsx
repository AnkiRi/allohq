"use client";

import { useState } from "react";
import { X, Search, Loader2 } from "lucide-react";
import { cn } from "@allohq/ui";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// ProductPicker modal
// ---------------------------------------------------------------------------

interface ProductPickerProps {
  open: boolean;
  onClose: () => void;
  storeId: string;
  onSelect: (productId: string, product: { id: string; title: string; price: number; imageUrl?: string }) => void;
}

export function ProductPicker({ open, onClose, storeId, onSelect }: ProductPickerProps) {
  const [query, setQuery] = useState("");

  const { data: results, isLoading } = trpc.products.search.useQuery(
    { storeId, query },
    { enabled: open && query.length > 0 }
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-xl border border-gray-200 shadow-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-bold font-mono text-gray-900 tracking-wider uppercase">
            Select Product
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              autoFocus
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 transition"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          )}

          {!isLoading && query.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm font-mono text-gray-400">Type to search products</p>
            </div>
          )}

          {!isLoading && query.length > 0 && results?.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm font-mono text-gray-400">No products found</p>
            </div>
          )}

          {results && results.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {results.map((product) => (
                <li key={product.id}>
                  <button
                    onClick={() => {
                      onSelect(product.id, { id: product.id, title: product.title, price: product.price, imageUrl: product.imageUrl ?? undefined });
                      onClose();
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-left",
                      "hover:bg-gray-50 transition-colors"
                    )}
                  >
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-10 h-10 rounded-lg object-cover border border-gray-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                        <span className="text-[10px] font-mono text-gray-400">IMG</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-medium text-gray-900 truncate">
                        {product.title}
                      </p>
                      <p className="text-xs font-mono text-gray-500">
                        ${(product.price / 100).toFixed(2)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
