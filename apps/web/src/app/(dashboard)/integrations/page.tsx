"use client";

import { useState } from "react";
import { Store, ShoppingBag, ArrowRight, Check, X, Loader2 } from "lucide-react";
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
  const [connecting, setConnecting] = useState(false);

  const { data: stores, isLoading } = trpc.stores.list.useQuery();

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

    setConnecting(true);
    window.location.href = `/api/shopify/auth?shop=${fullDomain}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono">
          INTEGRATIONS
        </h1>
        <p className="text-[13px] text-muted-foreground font-mono mt-1">
          Connect your e-commerce platforms
        </p>
      </div>

      {/* Connected stores */}
      {isLoading ? (
        <div className="space-y-3">
          <h2 className="text-[10px] font-mono text-muted-foreground uppercase font-bold tracking-[1px]">Connected Stores</h2>
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : connectedShopifyStores && connectedShopifyStores.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[10px] font-mono text-muted-foreground uppercase font-bold tracking-[1px]">
            Connected Stores
          </h2>
          {connectedShopifyStores.map((store) => (
            <a
              key={store.id}
              href="/integrations/shopify"
              className="flex items-center justify-between p-5 bg-card border border-border rounded-xl hover:border-foreground hover:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#96BF48] flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-[13px] font-medium text-foreground font-mono">
                    {store.shopDomain}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {store._count.products} products · {store._count.customers}{" "}
                    customers · {store._count.orders} orders
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-mono text-green-600">
                  <Check className="w-3.5 h-3.5" />
                  Connected
                </span>
                <ArrowRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Connect dialog -- loading indicator on redirect */}
      {isLoading && (
        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading stores...
        </div>
      )}

      {/* Platform cards */}
      <div className="space-y-3">
        <h2 className="text-[10px] font-mono text-muted-foreground uppercase font-bold tracking-[1px]">
          Available Integrations
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {platforms.map((platform) => (
            <div
              key={platform.id}
              className="p-5 bg-card border border-border rounded-xl hover:border-primary/50 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    platform.id === "shopify"
                      ? "bg-[#96BF48]"
                      : "bg-muted"
                  }`}
                >
                  <Store
                    className={`w-5 h-5 ${
                      platform.id === "shopify"
                        ? "text-white"
                        : "text-muted-foreground"
                    }`}
                  />
                </div>
                <div>
                  <div className="text-[13px] font-medium text-foreground font-mono">
                    {platform.name}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground font-mono mb-4">
                {platform.description}
              </p>
              {platform.status === "available" ? (
                <button
                  onClick={() => setShowDialog(true)}
                  className="w-full py-2 px-3 bg-secondary text-secondary-foreground text-[11px] font-mono rounded-lg hover:bg-secondary/90 transition-colors"
                >
                  Connect Shopify
                </button>
              ) : (
                <div className="w-full py-2 px-3 bg-muted text-muted-foreground text-[11px] font-mono rounded-lg text-center">
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
          <div className="bg-card rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-bold text-foreground font-mono">
                Connect Shopify Store
              </h3>
              <button
                onClick={() => {
                  setShowDialog(false);
                  setError("");
                  setShopDomain("");
                }}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-mono text-muted-foreground mb-1.5">
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
                    className="flex-1 px-3 py-2.5 border border-border rounded-l-lg text-[13px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all"
                  />
                  <span className="px-3 py-2.5 bg-muted border border-l-0 border-border rounded-r-lg text-[13px] font-mono text-muted-foreground">
                    .myshopify.com
                  </span>
                </div>
                {error && (
                  <p className="text-[11px] text-red-500 font-mono mt-1.5">
                    {error}
                  </p>
                )}
              </div>
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="w-full py-2.5 bg-secondary text-secondary-foreground text-[13px] font-mono rounded-lg hover:bg-secondary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {connecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {connecting ? "Connecting..." : "Connect Store"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
