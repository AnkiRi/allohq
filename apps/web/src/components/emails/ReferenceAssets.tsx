"use client";
import * as React from "react";

export type ReferenceAsset = { id: string; fileName: string; url?: string; source?: string };

export function ReferenceAssets({ assets, selectedId, onSelect, disabled = false }: {
  assets: ReferenceAsset[]; selectedId: string | null; onSelect: (id: string | null) => void;
  disabled?: boolean;
}) {
  return <fieldset className="mt-3">
    <legend className="text-[13px] font-medium">Reference for this image</legend>
    <p className="mt-1 text-[12px] leading-5 text-muted-foreground">Select a photo to send with this generation request. It does not affect copy suggestions in Ask Joon.</p>
    <div className="mt-2 grid grid-cols-3 gap-2">
      {assets.filter((asset) => asset.url).map((asset) => <button key={asset.id} type="button" disabled={disabled} aria-pressed={selectedId === asset.id}
        onClick={() => onSelect(selectedId === asset.id ? null : asset.id)}
        className={`min-w-0 overflow-hidden rounded-lg border p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#2D4F9E] ${selectedId === asset.id ? "border-[#2D4F9E] bg-[#E9EFFF]" : "border-border"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.url} alt={asset.fileName} loading="lazy" className="aspect-square w-full bg-white object-contain" />
        <span className="mt-1 block truncate text-[11px]" title={asset.fileName}>{asset.fileName}</span>
        <span className="block text-[10px] text-muted-foreground">{selectedId === asset.id ? "Selected reference" : asset.source === "generated" ? "Generated" : "Library image"}</span>
      </button>)}
    </div>
    {!assets.some((asset) => asset.url) ? <p className="mt-2 text-[12px] text-muted-foreground">Upload a reference photo or choose a Shopify product.</p> : null}
  </fieldset>;
}
