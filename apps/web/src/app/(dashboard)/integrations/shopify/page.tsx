"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  Unplug,
  Package,
  Users,
  ShoppingCart,
  Check,
  Clock,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function ShopifyDetailPage() {
  const [disconnecting, setDisconnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [preSyncLastSyncAt, setPreSyncLastSyncAt] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data: stores } = trpc.stores.list.useQuery(undefined, {
    refetchInterval: isSyncing ? 3000 : false,
  });
  const store = stores?.find((s) => s.platform === "shopify");

  const triggerSync = trpc.stores.triggerSync.useMutation({
    onSuccess: () => {
      setIsSyncing(true);
      setSyncDone(false);
      setPreSyncLastSyncAt(store?.lastSyncAt ?? null);
    },
  });

  // Detect sync completion
  useEffect(() => {
    if (!isSyncing || !store) return;
    const currentLastSync = store.lastSyncAt;
    if (currentLastSync && currentLastSync !== preSyncLastSyncAt) {
      setIsSyncing(false);
      setSyncDone(true);
      utils.stores.list.invalidate();
      // Reset sync done badge after 5 seconds
      const timer = setTimeout(() => setSyncDone(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isSyncing, store, preSyncLastSyncAt, utils]);

  const disconnect = trpc.stores.disconnect.useMutation({
    onSuccess: () => {
      utils.stores.list.invalidate();
      setDisconnecting(false);
    },
  });

  if (!store) {
    return (
      <div className="space-y-6">
        <Link
          href="/integrations"
          className="inline-flex items-center gap-2 text-sm text-gray-400 font-mono hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Integrations
        </Link>
        <div className="flex flex-col items-center justify-center py-20">
          <Package className="w-10 h-10 text-gray-300 mb-4" />
          <p className="text-sm text-gray-400 font-mono">
            No Shopify store connected
          </p>
          <Link
            href="/integrations"
            className="mt-4 px-4 py-2 bg-gray-900 text-white text-xs font-mono rounded-lg hover:bg-gray-800 transition-colors"
          >
            Connect Store
          </Link>
        </div>
      </div>
    );
  }

  const syncing = isSyncing || triggerSync.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link
            href="/integrations"
            className="inline-flex items-center gap-2 text-xs text-gray-400 font-mono hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Integrations
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">
            SHOPIFY
          </h1>
          <p className="text-sm text-gray-400 font-mono">{store.shopDomain}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => triggerSync.mutate({ storeId: store.id })}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 hover:border-gray-400 disabled:opacity-50 transition-all"
          >
            {syncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : syncDone ? (
              <Check className="w-3.5 h-3.5 text-green-600" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {syncing ? "Syncing..." : syncDone ? "Sync Complete!" : "Sync Now"}
          </button>
          <button
            onClick={() => setDisconnecting(true)}
            className="flex items-center gap-2 px-4 py-2 border border-red-200 rounded-lg text-xs font-mono text-red-600 hover:border-red-400 transition-all"
          >
            <Unplug className="w-3.5 h-3.5" />
            Disconnect
          </button>
        </div>
      </div>

      {/* Sync progress banner */}
      {syncing && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-gray-900 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-mono font-bold text-gray-900">
              Syncing store data...
            </p>
            <p className="text-xs font-mono text-gray-400 mt-0.5">
              Importing products, customers, and orders from {store.shopDomain}
            </p>
          </div>
          <div className="flex gap-4">
            {[
              { label: "Products", value: store._count.products },
              { label: "Customers", value: store._count.customers },
              { label: "Orders", value: store._count.orders },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className="text-lg font-mono font-bold text-gray-900 tabular-nums">
                  {item.value.toLocaleString()}
                </div>
                <div className="text-[10px] font-mono text-gray-400 uppercase">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync complete banner */}
      {syncDone && !syncing && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-mono font-bold text-green-700">
              Sync complete!
            </p>
            <p className="text-xs font-mono text-green-600 mt-0.5">
              All data imported successfully from {store.shopDomain}
            </p>
          </div>
          <div className="flex gap-4">
            {[
              { label: "Products", value: store._count.products },
              { label: "Customers", value: store._count.customers },
              { label: "Orders", value: store._count.orders },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className="text-lg font-mono font-bold text-green-700 tabular-nums">
                  {item.value.toLocaleString()}
                </div>
                <div className="text-[10px] font-mono text-green-600 uppercase">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#96BF48] flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 font-mono">
                {store.shopDomain}
              </span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-green-50 text-green-600">
                <Check className="w-3 h-3" />
                Active
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-400 font-mono">
              <Clock className="w-3 h-3" />
              {store.lastSyncAt
                ? `Last synced ${new Date(store.lastSyncAt).toLocaleString()}`
                : "Never synced"}
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "PRODUCTS",
            value: store._count.products,
            icon: Package,
            href: "/products",
          },
          {
            label: "CUSTOMERS",
            value: store._count.customers,
            icon: Users,
            href: "/customers",
          },
          {
            label: "ORDERS",
            value: store._count.orders,
            icon: ShoppingCart,
            href: "/orders",
          },
        ].map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className={`p-5 bg-white border rounded-xl hover:border-gray-900 hover:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all group ${
              syncing ? "border-gray-200 animate-pulse" : "border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-400 font-mono uppercase tracking-wider">
                {stat.label}
              </span>
              <stat.icon className="w-4 h-4 text-gray-300 group-hover:text-gray-900 transition-colors" />
            </div>
            <div className="text-3xl font-bold text-gray-900 font-mono tabular-nums">
              {stat.value.toLocaleString()}
            </div>
          </Link>
        ))}
      </div>

      {/* Disconnect confirmation dialog */}
      {disconnecting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-sm font-bold text-gray-900 font-mono mb-2">
              Disconnect Store?
            </h3>
            <p className="text-xs text-gray-400 font-mono mb-5">
              This will stop syncing data from {store.shopDomain}. Your existing
              data will be preserved.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDisconnecting(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 hover:border-gray-400 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => disconnect.mutate({ storeId: store.id })}
                disabled={disconnect.isPending}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-mono hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {disconnect.isPending ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
