"use client";

import * as React from "react";
import { Sparkles, Upload } from "lucide-react";
import { cn } from "@allohq/ui";

export type LibraryItem = {
  id: string;
  url: string;
  label: string;
  altText?: string | null;
  provenance?: { prompt: string | null; fromAssetIds: string[] } | null;
};

export type Library = {
  shopify: LibraryItem[];
  uploads: LibraryItem[];
  generated: LibraryItem[];
  brand: LibraryItem[];
  shopifyLogo: { url: string; label: string } | null;
  shopifyLogoMessage: string | null;
  storageConfigured: boolean;
};

type Tab = "shopify" | "uploads" | "generated" | "brand";

/**
 * Every picture this store can use, with where it came from stated.
 *
 * The old "reference assets" strip was one flat list of uploads. A merchant
 * could not tell a Shopify product photo from something Joon invented, which
 * is precisely the distinction that decides whether a picture can be trusted
 * as a record of the product.
 *
 * Shopify images are listed BY REFERENCE from the synced catalogue. Joon does
 * not hold copies of them and does not imply it does.
 */
export function AssetLibrary({
  library,
  loading,
  initialTab,
  onSelect,
  onUpload,
  onGenerate,
}: {
  library: Library | null;
  loading?: boolean;
  /** Opening from a product context can land straight on Shopify images. */
  initialTab?: Tab;
  onSelect: (item: LibraryItem) => void;
  onUpload: () => void;
  onGenerate: () => void;
}) {
  const [tab, setTab] = React.useState<Tab>(initialTab ?? "generated");

  if (loading || !library) {
    return <p className="p-4 text-[12px] text-muted-foreground">Loading your images…</p>;
  }

  const groups: Array<{ id: Tab; label: string; items: LibraryItem[]; blurb: string }> = [
    { id: "generated", label: "Generated", items: library.generated, blurb: "Made by Joon. Check them before approving." },
    { id: "uploads", label: "Uploads", items: library.uploads, blurb: "Files you added." },
    { id: "shopify", label: "Shopify", items: library.shopify, blurb: "Product photos, read from your store." },
    { id: "brand", label: "Brand", items: library.brand, blurb: "Logos and brand imagery." },
  ];
  const active = groups.find((group) => group.id === tab)!;

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-border p-4">
        <h3 className="text-[13px] font-medium">Asset library</h3>
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={onGenerate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#17204D] px-2.5 py-1.5 text-[12px] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate
          </button>
          <button
            type="button"
            onClick={onUpload}
            disabled={!library.storageConfigured}
            title={library.storageConfigured ? undefined : "Uploads are not available for this workspace yet"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] outline-none hover:bg-[#F4F2EC] focus-visible:ring-2 focus-visible:ring-[#2D4F9E] disabled:opacity-40"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </button>
        </div>
      </div>

      <div role="tablist" aria-label="Where images came from" className="flex gap-1 border-b border-border px-3 py-2">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            role="tab"
            aria-selected={tab === group.id}
            onClick={() => setTab(group.id)}
            className={cn(
              "rounded-md px-2 py-1 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[#2D4F9E]",
              tab === group.id ? "bg-[#E9EFFF] font-medium text-[#2D4F9E]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {group.label}
            <span className="ml-1 tabular-nums opacity-60">{group.items.length}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="mb-2 text-[11px] text-muted-foreground">{active.blurb}</p>

        {tab === "brand" && library.shopifyLogoMessage ? (
          <p className="mb-2 rounded-lg border border-dashed border-border p-2.5 text-[12px] text-muted-foreground">
            {library.shopifyLogoMessage}
          </p>
        ) : null}

        {active.items.length ? (
          <ul className="grid grid-cols-2 gap-2">
            {active.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="w-full overflow-hidden rounded-lg border border-border text-left outline-none hover:border-[#2D4F9E] focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.altText ?? item.label} className="aspect-[4/3] w-full object-cover" />
                  <span className="block truncate px-2 py-1.5 text-[11px] font-medium">{item.label}</span>
                  {item.provenance?.prompt ? (
                    <span className="block truncate px-2 pb-1.5 text-[10px] text-muted-foreground">
                      {item.provenance.prompt}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-3 text-[12px] text-muted-foreground">
            {tab === "shopify"
              ? "No product photos have synced from your store yet."
              : tab === "generated"
                ? "Nothing generated yet. Ask Joon for a visual."
                : tab === "uploads"
                  ? "Nothing uploaded yet."
                  : "No brand imagery yet."}
          </p>
        )}
      </div>
    </div>
  );
}
