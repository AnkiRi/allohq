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
  Trash2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

export default function ShopifyDetailPage() {
  const [disconnecting, setDisconnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [preSyncLastSyncAt, setPreSyncLastSyncAt] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { toast } = useToast();

  const { data: stores, isLoading } = trpc.stores.connections.useQuery(undefined, {
    refetchInterval: isSyncing ? 3000 : false,
  });
  const store = stores?.find((s: { platform: string }) => s.platform === "shopify");

  const triggerSync = trpc.stores.triggerSync.useMutation({
    onSuccess: () => {
      setIsSyncing(true);
      setSyncDone(false);
      setPreSyncLastSyncAt(store?.lastSyncAt ?? null);
    },
  });

  // Detect sync completion
  const storeLastSyncAt = store?.lastSyncAt ?? null;
  useEffect(() => {
    if (!isSyncing) return;
    if (storeLastSyncAt && storeLastSyncAt !== preSyncLastSyncAt) {
      setIsSyncing(false);
      setSyncDone(true);
      utils.stores.list.invalidate();
      // Reset sync done badge after 5 seconds
      const timer = setTimeout(() => setSyncDone(false), 5000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSyncing, storeLastSyncAt, preSyncLastSyncAt]);

  const disconnect = trpc.stores.disconnect.useMutation({
    onSuccess: () => {
      utils.stores.list.invalidate();
      utils.stores.connections.invalidate();
      setDisconnecting(false);
      toast("Shopify disconnected. Joon retained your intelligence and verified sender setup.", "success");
    },
    onError: (error) => toast(error.message || "We couldn't disconnect this store.", "error"),
  });

  const deleteStoreData = trpc.stores.deleteStoreData.useMutation({
    onSuccess: (result) => {
      utils.stores.list.invalidate();
      utils.stores.connections.invalidate();
      setDeleting(false);
      setDeleteConfirmation("");
      toast(
        result.providerCleanupWarning
          ? "Store data deleted. Sender-provider cleanup needs operator review."
          : "Store data permanently deleted. DNS records at your DNS host were not changed.",
        result.providerCleanupWarning ? "error" : "success"
      );
    },
    onError: (error) => toast(error.message || "We couldn't delete this store's data.", "error"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Link
          href="/integrations"
          className="inline-flex items-center gap-2 text-[13px] text-muted-foreground font-sans hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Integrations
        </Link>
        <div className="flex items-center gap-2 py-20 justify-center text-[13px] text-muted-foreground font-sans">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading your store...
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="space-y-6">
        <Link
          href="/integrations"
          className="inline-flex items-center gap-2 text-[13px] text-muted-foreground font-sans hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Integrations
        </Link>
        <div className="flex flex-col items-center justify-center py-20">
          <Package className="w-10 h-10 text-muted-foreground/50 mb-4" />
          <p className="text-[13px] text-muted-foreground">
            No Shopify store connected yet
          </p>
          <Link
            href="/integrations"
            className="mt-4 px-4 py-2 bg-secondary text-secondary-foreground text-[11px] font-sans rounded-lg hover:bg-secondary/90 transition-colors"
          >
            Connect store
          </Link>
        </div>
      </div>
    );
  }

  const syncing = isSyncing || triggerSync.isPending;
  const active = store.isActive;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link
            href="/integrations"
            className="inline-flex items-center gap-2 text-[11px] text-muted-foreground font-sans hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Integrations
          </Link>
          <h1 className="text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
            Shopify
          </h1>
          <p className="text-[13px] text-muted-foreground">{store.shopDomain}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => triggerSync.mutate({ storeId: store.id })}
            disabled={syncing || !active}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-[11px] font-sans text-foreground hover:border-primary/50 disabled:opacity-50 transition-all"
          >
            {syncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : syncDone ? (
              <Check className="w-3.5 h-3.5 text-outcome" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {syncing ? "Syncing..." : syncDone ? "All synced" : "Sync now"}
          </button>
          {active ? (
            <button
              onClick={() => setDisconnecting(true)}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-[11px] font-sans text-foreground hover:border-foreground/50 transition-all"
            >
              <Unplug className="w-3.5 h-3.5" />
              Disconnect
            </button>
          ) : (
            <Link
              href="/integrations"
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-[11px] font-sans"
            >
              Reconnect Shopify
            </Link>
          )}
          <button
            onClick={() => setDeleting(true)}
            className="flex items-center gap-2 px-4 py-2 border border-destructive/30 rounded-lg text-[11px] font-sans text-destructive hover:border-destructive/60 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete data
          </button>
        </div>
      </div>

      {/* Sync progress banner */}
      {syncing && (
        <div className="bg-muted border border-border rounded-xl p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-foreground animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] font-bold text-foreground">
              joon is syncing your store...
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Bringing in products, customers, and orders from {store.shopDomain}
            </p>
          </div>
          <div className="flex gap-4">
            {[
              { label: "Products", value: store._count.products },
              { label: "Customers", value: store._count.customers },
              { label: "Orders", value: store._count.orders },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className="text-[18px] tracking-[-0.5px] font-mono font-bold text-foreground tabular-nums">
                  {item.value.toLocaleString()}
                </div>
                <div className="text-[10px] font-sans text-muted-foreground uppercase">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync complete banner */}
      {syncDone && !syncing && (
        <div className="bg-[hsl(var(--success))/0.1] border border-[hsl(var(--success))/0.25] rounded-xl p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-outcome flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] font-bold text-outcome">
              All synced
            </p>
            <p className="text-[11px] text-outcome/80 mt-0.5">
              joon has everything from {store.shopDomain}
            </p>
          </div>
          <div className="flex gap-4">
            {[
              { label: "Products", value: store._count.products },
              { label: "Customers", value: store._count.customers },
              { label: "Orders", value: store._count.orders },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className="text-[18px] tracking-[-0.5px] font-mono font-bold text-outcome tabular-nums">
                  {item.value.toLocaleString()}
                </div>
                <div className="text-[10px] font-sans text-outcome/80 uppercase">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status card */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-decision flex items-center justify-center">
            <Package className="w-5 h-5 text-[hsl(var(--accent-foreground))]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-foreground font-mono">
                {store.shopDomain}
              </span>
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans ${
                active
                  ? "bg-[hsl(var(--success))/0.12] text-outcome"
                  : "bg-muted text-muted-foreground"
              }`}>
                <Check className="w-3 h-3" />
                {active ? "Active" : "Disconnected"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground font-sans">
              <Clock className="w-3 h-3" />
              {store.lastSyncAt
                ? `Last synced ${new Date(store.lastSyncAt).toLocaleString()}`
                : "Not synced yet"}
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
            className={`p-5 bg-card border rounded-xl hover:border-foreground hover:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all group ${
              syncing ? "border-border animate-pulse" : "border-border"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-muted-foreground font-sans uppercase font-bold tracking-[1px]">
                {stat.label}
              </span>
              <stat.icon className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
            </div>
            <div className="text-[28px] font-bold text-foreground font-mono tabular-nums">
              {stat.value.toLocaleString()}
            </div>
          </Link>
        ))}
      </div>

      {/* Disconnect confirmation dialog */}
      {disconnecting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-[13px] font-bold text-foreground font-serif mb-2">
              Disconnect this store?
            </h3>
            <p className="text-[11px] text-muted-foreground mb-5">
              Joon will immediately stop syncing and sending for {store.shopDomain}.
              Customers, orders, campaigns, decisions and verified sender-domain setup stay
              available for reconnection. Active automations are paused and unsent campaigns
              are cancelled; Joon will not silently restart them later.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDisconnecting(false)}
                className="flex-1 py-2 border border-border rounded-lg text-[11px] font-sans text-foreground hover:border-primary/50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => disconnect.mutate({ storeId: store.id })}
                disabled={disconnect.isPending}
                className="flex-1 py-2 bg-destructive text-destructive-foreground rounded-lg text-[11px] font-sans hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {disconnect.isPending ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-[16px] font-semibold text-foreground">Permanently delete store data?</h3>
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
              This permanently removes customers, orders, campaigns, intelligence, history,
              sender-domain setup and other data Joon stores for this shop. It cannot be
              undone. Provider-side sending identity removal will be attempted, but DNS
              records at your DNS host must be removed there.
            </p>
            <label className="mt-5 block text-[12px] font-medium text-foreground">
              Type <span className="font-mono">{store.shopDomain}</span> to confirm
            </label>
            <input
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-destructive"
              autoComplete="off"
            />
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => { setDeleting(false); setDeleteConfirmation(""); }}
                className="flex-1 rounded-lg border border-border py-2 text-[12px] text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteStoreData.mutate({ storeId: store.id, confirmation: deleteConfirmation })}
                disabled={deleteConfirmation !== store.shopDomain || deleteStoreData.isPending}
                className="flex-1 rounded-lg bg-destructive py-2 text-[12px] text-destructive-foreground disabled:opacity-40"
              >
                {deleteStoreData.isPending ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
