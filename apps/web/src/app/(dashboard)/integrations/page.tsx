"use client";

import { useState } from "react";
import { Store, ShoppingBag, ArrowRight, Check, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

const platforms = [
  {
    id: "shopify",
    name: "Shopify",
    description: "Sync products, customers, and orders from your Shopify store",
    status: "available" as const,
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    description: "Connect your WordPress + WooCommerce store",
    status: "coming_soon" as const,
  },
  {
    id: "bigcommerce",
    name: "BigCommerce",
    description: "Integrate with BigCommerce storefronts",
    status: "coming_soon" as const,
  },
];

export default function IntegrationsPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  const [error, setError] = useState("");

  const { data: stores, isLoading: _isLoading } = trpc.stores.list.useQuery();

  const connectedShopifyStores = stores?.filter(
    (s) => s.platform === "shopify"
  );

  function handleConnect() {
    const domain = shopDomain.trim();
    if (!domain) {
      setError("Please enter your shop domain");
      return;
    }

    // Ensure it ends with .myshopify.com
    const fullDomain = domain.includes(".myshopify.com")
      ? domain
      : `${domain}.myshopify.com`;

    if (!/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(fullDomain)) {
      setError("Invalid domain format");
      return;
    }

    window.location.href = `/api/shopify/auth?shop=${fullDomain}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">
          INTEGRATIONS
        </h1>
        <p className="text-sm text-gray-400 font-mono mt-1">
          Connect your e-commerce platforms
        </p>
      </div>

      {/* Connected stores */}
      {connectedShopifyStores && connectedShopifyStores.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-mono text-gray-400 uppercase tracking-wider">
            Connected Stores
          </h2>
          {connectedShopifyStores.map((store) => (
            <a
              key={store.id}
              href="/integrations/shopify"
              className="flex items-center justify-between p-5 bg-white border border-gray-200 rounded-xl hover:border-gray-900 hover:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#96BF48] flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 font-mono">
                    {store.shopDomain}
                  </div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">
                    {store._count.products} products · {store._count.customers}{" "}
                    customers · {store._count.orders} orders
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-mono text-green-600">
                  <Check className="w-3.5 h-3.5" />
                  Connected
                </span>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-900 transition-colors" />
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Platform cards */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono text-gray-400 uppercase tracking-wider">
          Available Integrations
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {platforms.map((platform) => (
            <div
              key={platform.id}
              className="p-5 bg-white border border-gray-200 rounded-xl hover:border-gray-400 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    platform.id === "shopify"
                      ? "bg-[#96BF48]"
                      : "bg-gray-100"
                  }`}
                >
                  <Store
                    className={`w-5 h-5 ${
                      platform.id === "shopify"
                        ? "text-white"
                        : "text-gray-400"
                    }`}
                  />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 font-mono">
                    {platform.name}
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 font-mono mb-4">
                {platform.description}
              </p>
              {platform.status === "available" ? (
                <button
                  onClick={() => setShowDialog(true)}
                  className="w-full py-2 px-3 bg-gray-900 text-white text-xs font-mono rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Connect Shopify
                </button>
              ) : (
                <div className="w-full py-2 px-3 bg-gray-50 text-gray-400 text-xs font-mono rounded-lg text-center">
                  Coming Soon
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Connect dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 font-mono">
                Connect Shopify Store
              </h3>
              <button
                onClick={() => {
                  setShowDialog(false);
                  setError("");
                  setShopDomain("");
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-gray-500 mb-1.5">
                  Shop Domain
                </label>
                <div className="flex items-center">
                  <input
                    type="text"
                    placeholder="your-store"
                    value={shopDomain}
                    onChange={(e) => {
                      setShopDomain(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                    className="flex-1 px-3 py-2.5 border border-gray-200 rounded-l-lg text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 focus:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all"
                  />
                  <span className="px-3 py-2.5 bg-gray-50 border border-l-0 border-gray-200 rounded-r-lg text-sm font-mono text-gray-400">
                    .myshopify.com
                  </span>
                </div>
                {error && (
                  <p className="text-xs text-red-500 font-mono mt-1.5">
                    {error}
                  </p>
                )}
              </div>
              <button
                onClick={handleConnect}
                className="w-full py-2.5 bg-gray-900 text-white text-sm font-mono rounded-lg hover:bg-gray-800 transition-colors"
              >
                Connect Store
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
