"use client";

import * as React from "react";
import { cn } from "@allohq/ui";
import { modeLabel, modePromise } from "@allohq/email-builder";

export type VisualMode = "product_safe" | "creative_concept";
export type GeneratedVisual = {
  slotId: string;
  label: string;
  url: string;
  assetId: string;
  modeLabel: string;
};
export type VisualFailure = { slotId: string; reason: string };
export type VisualSlotDraft = { id: string; label: string; prompt: string };

/**
 * Asking Joon for email artwork.
 *
 * Four slots, each generated separately and labelled, because a merchant who
 * asks for "a hero, a lifestyle shot, a crop and a backdrop" wants four assets
 * to choose between — not one image with four ideas in it.
 *
 * Mode is an explicit choice rather than something inferred from wording,
 * because the two modes promise different things: one keeps the product
 * exactly as it is, the other is openly an invention.
 */
export function VisualGenerator({
  mode,
  setMode,
  slots,
  setSlots,
  productTitle,
  productHasImage,
  results,
  failures,
  pending,
  onGenerate,
  onUseAsset,
}: {
  mode: VisualMode;
  setMode: (mode: VisualMode) => void;
  slots: VisualSlotDraft[];
  setSlots: (slots: VisualSlotDraft[]) => void;
  productTitle: string | null;
  productHasImage: boolean;
  results: GeneratedVisual[];
  failures: VisualFailure[];
  pending: boolean;
  onGenerate: () => void;
  onUseAsset: (visual: GeneratedVisual) => void;
}) {
  const productSafeBlocked = mode === "product_safe" && !productHasImage;
  const nothingToDo = slots.every((slot) => !slot.prompt.trim());

  return (
    <section className="p-4">
      <h3 className="text-[12px] font-medium">Generate visuals</h3>

      <div className="mt-3" role="radiogroup" aria-labelledby="visual-mode-label">
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground" id="visual-mode-label">
          What kind of image
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(["product_safe", "creative_concept"] as const).map((option) => (
            <button
              key={option}
              type="button"
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
        <p className="mt-1.5 text-[11px] text-muted-foreground">{modePromise(mode)}</p>
        {mode === "creative_concept" ? (
          <p className="mt-1.5 rounded-lg border border-[var(--attention,#C99116)]/40 bg-[var(--attention-soft,#FFF0B8)] p-2 text-[11px]">
            Joon’s current image providers cannot take your product photo as a
            reference, so a board, bottle or jar drawn here is invented. For the
            real product in a new setting, use “{modeLabel("product_safe")}”.
          </p>
        ) : null}
      </div>

      {productSafeBlocked ? (
        <p className="mt-3 rounded-lg border border-[var(--attention,#C99116)]/40 bg-[var(--attention-soft,#FFF0B8)] p-2.5 text-[12px]">
          {productTitle
            ? `${productTitle} has no image in Shopify, so there is nothing to composite. Pick a product with an image, or switch to a generated concept.`
            : "Bind a product with an image in the Shopify tab, or switch to a generated concept."}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground">
          Up to four visuals, each generated separately
        </p>
        {slots.map((slot, index) => (
          <div key={slot.id}>
            <label className="mb-1 block text-[11px]" htmlFor={`visual-slot-${slot.id}`}>
              {slot.label}
            </label>
            <input
              id={`visual-slot-${slot.id}`}
              value={slot.prompt}
              onChange={(event) => {
                const next = [...slots];
                next[index] = { ...slot, prompt: event.target.value };
                setSlots(next);
              }}
              placeholder="Describe this one…"
              className="w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--evidence,#2D4F9E)]"
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
        disabled={pending || productSafeBlocked || nothingToDo}
        className="mt-3 w-full rounded-lg bg-[#17204D] px-3 py-2 text-[13px] font-medium text-white disabled:opacity-40"
      >
        {pending ? "Generating…" : "Generate visuals"}
      </button>

      {results.length ? (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium">
            {results.length} visual{results.length === 1 ? "" : "s"} · choose one
          </p>
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
