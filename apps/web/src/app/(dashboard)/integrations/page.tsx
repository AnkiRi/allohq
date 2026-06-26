"use client";

import { useState } from "react";
import { Store, ShoppingBag, ArrowRight, Check, X, Loader2, Mail, BarChart3, MessageSquare, Bell } from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const ecommercePlatforms = [
  {
    id: "shopify",
    name: "Shopify",
    description: "Connect Shopify and allo will start learning your store: products, customers, and orders.",
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

const emailSmsPlatforms = [
  {
    id: "klaviyo",
    name: "Klaviyo",
    description: "Email & SMS marketing automation for e-commerce",
    status: "coming_soon" as const,
  },
  {
    id: "postscript",
    name: "Postscript",
    description: "SMS marketing platform built for Shopify brands",
    status: "coming_soon" as const,
  },
  {
    id: "attentive",
    name: "Attentive",
    description: "Personalized SMS and email marketing at scale",
    status: "coming_soon" as const,
  },
];

const analyticsPlatforms = [
  {
    id: "google-analytics",
    name: "Google Analytics",
    description: "Track website traffic, conversions, and customer behavior",
    status: "coming_soon" as const,
  },
  {
    id: "triple-whale",
    name: "Triple Whale",
    description: "Attribution and analytics dashboard for DTC brands",
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
    (s: any) => s.platform === "shopify"
  );

  function handleConnect() {
    const domain = shopDomain.trim();
    if (!domain) {
      setError("Please enter your shop domain to continue");
      return;
    }

    // Ensure it ends with .myshopify.com
    const fullDomain = domain.includes(".myshopify.com")
      ? domain
      : `${domain}.myshopify.com`;

    if (!/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(fullDomain)) {
      setError("That doesn't look like a Shopify domain. Try just your store name.");
      return;
    }

    setConnecting(true);
    window.location.href = `/api/shopify/auth?shop=${fullDomain}`;
  }

  return (
    <motion.div
      className="space-y-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="section-header accent-bar-left text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
          Integrations
        </h1>
        <p className="text-[13px] text-muted-foreground font-sans mt-1 pl-4">
          Connect your store and tools so allo can work across all of them
        </p>
      </motion.div>

      {/* Connected stores */}
      {isLoading ? (
        <motion.div className="space-y-3" variants={itemVariants}>
          <h2 className="section-header text-[10px] text-muted-foreground">Connected Stores</h2>
          {[1, 2].map((i) => (
            <div key={i} className="h-20 glass-skeleton rounded-xl" />
          ))}
        </motion.div>
      ) : connectedShopifyStores && connectedShopifyStores.length > 0 && (
        <motion.div className="space-y-3" variants={itemVariants}>
          <h2 className="section-header text-[10px] text-muted-foreground">
            Connected Stores
          </h2>
          {connectedShopifyStores.map((store: any) => (
            <motion.a
              key={store.id}
              href="/integrations/shopify"
              className="flex items-center justify-between p-5 glass-card rounded-xl group"
              variants={itemVariants}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-accent)] flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-[hsl(var(--accent-foreground))]" />
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
                <span className="flex items-center gap-1.5 text-[11px] font-sans text-[var(--color-success)]">
                  <Check className="w-3.5 h-3.5" />
                  Connected
                </span>
                <ArrowRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
              </div>
            </motion.a>
          ))}
        </motion.div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <motion.div
          className="flex items-center gap-2 text-[11px] font-sans text-muted-foreground"
          variants={itemVariants}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading your stores...
        </motion.div>
      )}

      {/* E-Commerce Platforms */}
      <motion.div className="space-y-3" variants={itemVariants}>
        <h2 className="section-header text-[10px] text-muted-foreground">
          E-Commerce Platforms
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {ecommercePlatforms.map((platform) => (
            <motion.div
              key={platform.id}
              className="p-5 glass-card rounded-xl"
              variants={itemVariants}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    platform.id === "shopify"
                      ? "bg-[var(--color-accent)]"
                      : "bg-muted"
                  }`}
                >
                  <Store
                    className={`w-5 h-5 ${
                      platform.id === "shopify"
                        ? "text-[hsl(var(--accent-foreground))]"
                        : "text-muted-foreground"
                    }`}
                  />
                </div>
                <div>
                  <div className="text-[13px] font-medium text-foreground font-sans">
                    {platform.name}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mb-4">
                {platform.description}
              </p>
              {platform.status === "available" ? (
                <button
                  onClick={() => setShowDialog(true)}
                  className="w-full py-2 px-3 bg-secondary text-secondary-foreground text-[11px] font-sans rounded-lg hover:bg-secondary/90 transition-colors"
                >
                  Connect Shopify
                </button>
              ) : (
                <div className="w-full py-2 px-3 bg-muted text-muted-foreground text-[11px] font-sans rounded-lg text-center">
                  Coming Soon
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Email & SMS */}
      <motion.div className="space-y-3" variants={itemVariants}>
        <h2 className="section-header text-[10px] text-muted-foreground">
          Email & SMS
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {emailSmsPlatforms.map((platform) => (
            <motion.div
              key={platform.id}
              className="p-5 glass-card-static rounded-xl opacity-60"
              variants={itemVariants}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  {platform.id === "postscript" || platform.id === "attentive" ? (
                    <MessageSquare className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <Mail className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <div className="text-[13px] font-medium text-foreground font-sans">
                    {platform.name}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mb-4">
                {platform.description}
              </p>
              <div className="w-full py-2 px-3 bg-muted text-muted-foreground text-[11px] font-sans rounded-lg text-center mb-2">
                Coming Soon
              </div>
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground font-sans">
                <Bell className="w-3 h-3" />
                Notify me when available
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Analytics */}
      <motion.div className="space-y-3" variants={itemVariants}>
        <h2 className="section-header text-[10px] text-muted-foreground">
          Analytics
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {analyticsPlatforms.map((platform) => (
            <motion.div
              key={platform.id}
              className="p-5 glass-card-static rounded-xl opacity-60"
              variants={itemVariants}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-[13px] font-medium text-foreground font-sans">
                    {platform.name}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mb-4">
                {platform.description}
              </p>
              <div className="w-full py-2 px-3 bg-muted text-muted-foreground text-[11px] font-sans rounded-lg text-center mb-2">
                Coming Soon
              </div>
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground font-sans">
                <Bell className="w-3 h-3" />
                Notify me when available
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Connect dialog */}
      {showDialog && (
        <div className="fixed inset-0 glass-card-static flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
          <div className="glass-card-static rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-bold text-foreground font-serif">
                Connect your Shopify store
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
                <label className="block text-[11px] font-sans text-muted-foreground mb-1.5">
                  Your store address
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
                  <p className="text-[11px] text-destructive mt-1.5">
                    {error}
                  </p>
                )}
              </div>
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="w-full py-2.5 bg-secondary text-secondary-foreground text-[13px] font-sans rounded-lg hover:bg-secondary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {connecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {connecting ? "Connecting..." : "Connect store"}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
