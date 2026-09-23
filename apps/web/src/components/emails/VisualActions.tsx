"use client";

import * as React from "react";
import { ImagePlus, Library, Sparkles, Upload } from "lucide-react";
import { cn } from "@allohq/ui";
import type { EmailBlock } from "@allohq/email-builder";

export type VisualCapabilitySummary = {
  generationAvailable: boolean;
  storageConfigured?: boolean;
  storageMessage?: string | null;
  provider: string | null;
  referenceGrounded: boolean;
  spendRefusal: string | null;
};

/**
 * What the Visuals tab offers, decided by what is selected.
 *
 * The four-slot generator used to appear for every block, including dividers
 * and text — a large repeated form where most of the time the answer was
 * "not here". Blocks now get the actions that make sense for them, and the
 * four-output request stays as a deliberate advanced workflow.
 */
export function VisualActions({
  selected,
  capabilities,
  productTitle,
  onGenerate,
  onUpload,
  onChooseFromLibrary,
  onCreateProductScene,
  onOpenAdvanced,
}: {
  selected: EmailBlock | null;
  capabilities: VisualCapabilitySummary | null;
  productTitle: string | null;
  onGenerate: () => void;
  onUpload: () => void;
  onChooseFromLibrary: () => void;
  onCreateProductScene: () => void;
  onOpenAdvanced: () => void;
}) {
  const blocked = capabilities
    ? capabilities.storageConfigured === false
      ? capabilities.storageMessage
      : !capabilities.generationAvailable
        ? "Image generation is not available for this workspace yet."
        : capabilities.spendRefusal
    : null;

  if (!selected) {
    return <Empty>Select a block to see what Joon can make for it.</Empty>;
  }

  if (selected.type === "product" || selected.type === "product_grid") {
    return (
      <div className="p-4">
        <h3 className="text-[13px] font-medium">Product imagery comes from Shopify</h3>
        <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
          {productTitle ? `${productTitle}'s` : "This product's"} photo, title and price are
          read from your store when the email is sent, so Joon does not replace them.
        </p>
        <button
          type="button"
          onClick={onCreateProductScene}
          disabled={Boolean(blocked)}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17204D] px-3 py-2 text-[13px] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[#2D4F9E] disabled:opacity-40"
        >
          <Sparkles className="h-4 w-4" />
          Create a campaign visual from this product
        </button>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Adds a new image block above this one. The product card keeps its own photo.
        </p>
        {blocked ? <Blocked>{blocked}</Blocked> : null}
      </div>
    );
  }

  if (selected.type === "image" || selected.type === "hero") {
    return (
      <div className="p-4">
        <h3 className="text-[13px] font-medium">Picture for this {selected.type} block</h3>
        <div className="mt-3 grid gap-2">
          <Action icon={<Sparkles className="h-4 w-4" />} label="Generate a visual" detail={capabilities?.provider ? `Using ${capabilities.provider}` : "Ask Joon for artwork"} onClick={onGenerate} disabled={Boolean(blocked)} primary />
          <Action icon={<Upload className="h-4 w-4" />} label="Upload an image" detail="From your computer" onClick={onUpload} disabled={capabilities?.storageConfigured === false} />
          <Action icon={<Library className="h-4 w-4" />} label="Choose from library" detail="Images already in this workspace" onClick={onChooseFromLibrary} />
        </div>
        {blocked ? <Blocked>{blocked}</Blocked> : null}
        <button
          type="button"
          onClick={onOpenAdvanced}
          className="mt-3 text-[11px] text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
        >
          Ask for several variations at once
        </button>
      </div>
    );
  }

  return (
    <Empty>
      A {selected.type.replace(/_/g, " ")} block has no picture. Select an image or hero block,
      or add one.
    </Empty>
  );
}

function Action({
  icon, label, detail, onClick, disabled, primary,
}: {
  icon: React.ReactNode; label: string; detail: string;
  onClick: () => void; disabled?: boolean; primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#2D4F9E] disabled:opacity-40",
        primary ? "border-[#2D4F9E] bg-[#E9EFFF]" : "border-border hover:border-[#2D4F9E] hover:bg-[#F4F2EC]",
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}

function Blocked({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-lg border border-[#B95849]/40 bg-[#FAE8E4] p-2.5 text-[12px]">
      {children}
    </p>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <p className="max-w-[30ch] text-[13px] text-muted-foreground">
        <ImagePlus className="mx-auto mb-2 h-5 w-5 opacity-40" />
        {children}
      </p>
    </div>
  );
}
