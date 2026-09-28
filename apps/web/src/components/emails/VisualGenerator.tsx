"use client";

import * as React from "react";
import { cn } from "@allohq/ui";
import { modeLabel } from "@allohq/email-builder";
import { ReferenceAssets, type ReferenceAsset } from "./ReferenceAssets";

export type VisualMode = "product_safe" | "creative_concept";
export type GeneratedVisual = {
  slotId: string;
  label: string;
  url: string;
  assetId: string;
  modeLabel: string;
  /** Captured by the generation request, never inferred from later selection. */
  sourceProductId?: string | null;
};
export type VisualFailure = { slotId: string; reason: string };
export type VisualSlotDraft = { id: string; label: string; prompt: string };
export type VisualCapabilities = {
  generationAvailable: boolean;
  /** Durable storage. Reported separately so the reason is accurate. */
  storageConfigured?: boolean;
  storageMessage?: string | null;
  providerAvailable?: boolean;
  provider: string | null;
  missingCredentials: string[];
  referenceGrounded: boolean;
  referenceSetup: Array<{ provider: string; variables: string[] }>;
  spendRefusal: string | null;
};

/**
 * Asking Joon for email artwork.
 *
 * One request by default; optional slots are generated separately because a merchant who
 * asks for "a hero, a lifestyle shot, a crop and a backdrop" wants four assets
 * to choose between — not one image with four ideas in it.
 *
 * Mode is an explicit choice rather than something inferred from wording,
 * because the two modes use different inputs: one sends a reference photo
 * (whose fidelity still needs review), the other is openly an invention.
 */
export function VisualGenerator({
  mode,
  setMode,
  slots,
  setSlots,
  productTitle,
  productHasImage,
  capabilities,
  results,
  failures,
  pending,
  placementDescription,
  onGenerate,
  onUseAsset,
  productImageUrl,
  referenceAssets = [],
  selectedReferenceId = null,
  onSelectReference,
  onClose,
}: {
  mode: VisualMode;
  setMode: (mode: VisualMode) => void;
  slots: VisualSlotDraft[];
  setSlots: (slots: VisualSlotDraft[]) => void;
  productTitle: string | null;
  productHasImage: boolean;
  /** What generation can do right now. Null while it is still being fetched. */
  capabilities: VisualCapabilities | null;
  results: GeneratedVisual[];
  failures: VisualFailure[];
  pending: boolean;
  placementDescription?: string | null;
  onGenerate: () => void;
  onUseAsset: (visual: GeneratedVisual) => void;
  productImageUrl?: string | null;
  referenceAssets?: ReferenceAsset[];
  selectedReferenceId?: string | null;
  onSelectReference?: (id: string | null) => void;
  onClose?: () => void;
}) {
  const productSafeBlocked = mode === "product_safe" && !productHasImage && !selectedReferenceId;
  const nothingToDo = slots.every((slot) => !slot.prompt.trim());
  const unavailable = capabilities ? !capabilities.generationAvailable : false;
  // Storage and provider fail for different reasons and need different copy.
  const storageBlocked = capabilities ? capabilities.storageConfigured === false : false;
  const spendBlocked = Boolean(capabilities?.spendRefusal);

  return (
    <section className="p-4">
      <div className="flex items-center justify-between gap-2"><h3 className="text-[14px] font-medium">Generate a campaign picture</h3>{onClose ? <button type="button" onClick={onClose} disabled={pending} className="text-[12px] text-[#2D4F9E] underline underline-offset-2">Library or upload</button> : null}</div>

      {productTitle ? <div className="mt-3 flex items-center gap-3 rounded-lg bg-[#F4F2EC] p-2">
        {productImageUrl ? <img src={productImageUrl} alt={productTitle} className="h-16 w-16 bg-white object-contain" /> : null}
        <div className="min-w-0"><p className="text-[12px] text-muted-foreground">Shopify reference</p><p className="text-[13px] font-medium">{productTitle}</p><p className="mt-1 text-[12px] leading-5 text-muted-foreground">This photo is sent with your request. Review the result for product fidelity before using it.</p></div>
      </div> : null}
      {!productTitle ? <div className="mt-3" role="radiogroup" aria-labelledby="visual-mode-label">
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground" id="visual-mode-label">
          What kind of image
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(["product_safe", "creative_concept"] as const).map((option) => (
            <button
              key={option}
              type="button"
              disabled={pending}
              role="radio"
              aria-checked={mode === option}
              onClick={() => setMode(option)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[12px]",
                mode === option
                  ? "border-[var(--evidence,#2D4F9E)] bg-[var(--evidence-soft,#E9EFFF)] font-medium"
                  : "border-border hover:border-[var(--evidence,#2D4F9E)]",
              )}
            >
              {modeLabel(option)}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">{mode === "product_safe"
          ? "Your reference photo is sent to an image-capable model. Review the generated picture against the source; it is not guaranteed to reproduce every product detail."
          : "Illustrative campaign art. No product reference is sent in this mode; an invented product must not be presented as your actual product."}</p>
        {mode === "product_safe" && capabilities ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {capabilities.referenceGrounded
              ? `Your reference image is sent to ${capabilities.provider}. Check that the output keeps the right product.`
              : "A reference-capable model is required. Joon will refuse rather than quietly invent your product."}
          </p>
        ) : null}
        {mode === "creative_concept" ? (
          <p className="mt-1.5 rounded-lg border border-[var(--attention,#C99116)]/40 bg-[var(--attention-soft,#FFF0B8)] p-2 text-[11px]">
            A board, bottle or jar drawn without a reference is invented. For
            your product in a new setting, use “{modeLabel("product_safe")}”.
          </p>
        ) : null}
      </div> : null}
      {!productTitle && onSelectReference ? <ReferenceAssets assets={referenceAssets} selectedId={selectedReferenceId} onSelect={onSelectReference} disabled={pending} /> : null}

      {storageBlocked ? (
        <p className="mt-3 rounded-lg border border-[#B95849]/40 bg-[#FAE8E4] p-2.5 text-[12px]">
          {capabilities?.storageMessage}
        </p>
      ) : unavailable ? (
        <p className="mt-3 rounded-lg border border-[#B95849]/40 bg-[#FAE8E4] p-2.5 text-[12px]">
          Image generation is not switched on for this workspace, so Joon will not
          produce a visual rather than hand you a stand-in.
        </p>
      ) : null}

      {spendBlocked ? (
        <p className="mt-3 rounded-lg border border-[#C99116]/40 bg-[#FFF0B8] p-2.5 text-[12px]">
          {capabilities?.spendRefusal}
        </p>
      ) : null}

      {productSafeBlocked ? (
        <p className="mt-3 rounded-lg border border-[var(--attention,#C99116)]/40 bg-[var(--attention-soft,#FFF0B8)] p-2.5 text-[12px]">
          {productTitle
            ? `${productTitle} has no image in Shopify. Pick a product with an image, or switch to a generated concept.`
            : "Choose a reference photo or a Shopify product before generating from it."}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground">
          {slots.length === 1 ? "Describe this picture" : "Up to four visuals, each generated separately"}
        </p>
        {slots.map((slot, index) => (
          <div key={slot.id}>
            <label className="mb-1 block text-[11px]" htmlFor={`visual-slot-${slot.id}`}>
              {slot.label}
            </label>
            <textarea
              id={`visual-slot-${slot.id}`}
              disabled={pending}
              rows={slots.length === 1 ? 3 : 2}
              value={slot.prompt}
              onChange={(event) => {
                const next = [...slots];
                next[index] = { ...slot, prompt: event.target.value };
                setSlots(next);
              }}
              placeholder="Describe this one…"
              className="w-full resize-y rounded-lg border border-border bg-transparent px-2.5 py-2 text-[14px] leading-5 outline-none focus:border-[var(--evidence,#2D4F9E)]"
            />
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Prices, discounts and codes stay in editable blocks — Joon will not draw them
        into an image, where preflight could not check them.
      </p>

      <button
        type="button"
        onClick={onGenerate}
        disabled={pending || productSafeBlocked || nothingToDo || unavailable || storageBlocked || spendBlocked}
        className="mt-3 w-full rounded-lg bg-[#17204D] px-3 py-2 text-[13px] font-medium text-white disabled:opacity-40"
      >
        {pending ? "Generating…" : slots.length === 1 ? "Generate picture" : "Generate visuals"}
      </button>

      {results.length ? (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium">
            {results.length} visual{results.length === 1 ? "" : "s"} · choose one
          </p>
          {placementDescription ? <p className="mb-2 text-[12px] text-muted-foreground">Choosing one will {placementDescription.charAt(0).toLowerCase() + placementDescription.slice(1)}. Nothing changes until you choose.</p> : null}
          <div className="grid grid-cols-2 gap-2">
            {results.map((visual) => (
              <button
                key={visual.assetId}
                type="button"
                onClick={() => onUseAsset(visual)}
                className="overflow-hidden rounded-lg border border-border text-left hover:border-[var(--evidence,#2D4F9E)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={visual.url} alt={visual.label} className="aspect-[4/3] w-full object-cover" />
                <span className="block px-2 py-1.5 text-[11px] font-medium">{visual.label}</span>
                <span className="block px-2 pb-1.5 text-[10px] text-muted-foreground">
                  {visual.modeLabel}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {failures.length ? (
        <ul className="mt-3 space-y-1.5">
          {failures.map((failure) => (
            <li key={failure.slotId} className="text-[11px] text-[var(--risk,#B95849)]">
              <span className="font-medium">{failure.slotId}:</span> {failure.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
