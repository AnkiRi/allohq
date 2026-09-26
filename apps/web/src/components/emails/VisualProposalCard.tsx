"use client";

import * as React from "react";

export type VisualProposal = {
  instruction: string;
  kind: string;
  target: { kind: "existing"; blockId: string; blockType: "image" | "hero" } | { kind: "new"; blockType: "image" | "hero"; afterBlockId: string | null };
  targetDescription: string;
  product: { id: string; title: string; hasImage: boolean } | null;
  mode: "product_safe" | "creative_concept";
  modeLabel: string;
  providerLabel: string | null;
  referenceGrounded: boolean;
  costClass: "economy" | "standard" | "premium" | null;
  blockedReason: string | null;
};

/**
 * Joon's answer when a merchant asks for a picture.
 *
 * "Put this snowboard in the hands of a Brazilian model" previously went down
 * the copy-editing path, attempted an image operation on the way, and returned
 * a storage error — a configuration message where artwork was asked for.
 *
 * The answer is now a proposal: what would be made, where it would go, with
 * which model, at roughly what cost. Nothing is generated until the merchant
 * says so, and a blocked request stops here rather than at the point of spend.
 */
export function VisualProposalCard({
  proposal,
  onGenerate,
  onRefine,
  onCancel,
}: {
  proposal: VisualProposal;
  onGenerate: () => void;
  onRefine: () => void;
  onCancel: () => void;
}) {
  const blocked = Boolean(proposal.blockedReason);
  return (
    <div className="mt-4 rounded-xl border border-[#2D4F9E]/40 bg-[#E9EFFF] p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#2D4F9E]">
        Joon would make a visual
      </p>
      <p className="mt-1.5 text-[13px] leading-5">“{proposal.instruction}”</p>

      <dl className="mt-3 space-y-1.5 text-[12px]">
        {proposal.product ? (
          <Row label="Product">
            {proposal.product.title}
            {!proposal.product.hasImage ? " — no image in Shopify" : ""}
          </Row>
        ) : null}
        <Row label="Style">{proposal.modeLabel}</Row>
        <Row label="Where">{proposal.targetDescription}</Row>
        {proposal.providerLabel ? <Row label="Model">{proposal.providerLabel}</Row> : null}
        {proposal.costClass ? (
          <Row label="Cost tier">{proposal.costClass}</Row>
        ) : null}
      </dl>

      {proposal.mode === "creative_concept" ? (
        <p className="mt-2 rounded-lg border border-[#C99116]/40 bg-[#FFF0B8] p-2 text-[11px]">
          This will be invented artwork, not a photograph of your product.
        </p>
      ) : null}

      {blocked ? (
        <p className="mt-3 rounded-lg border border-[#B95849]/40 bg-[#FAE8E4] p-2.5 text-[12px]">
          {proposal.blockedReason}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={blocked}
          className="rounded-lg bg-[#17204D] px-3 py-1.5 text-[12px] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[#2D4F9E] disabled:opacity-40"
        >
          Generate
        </button>
        <button
          type="button"
          onClick={onRefine}
          className="rounded-lg border border-border bg-white/70 px-3 py-1.5 text-[12px] outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
        >
          Edit request
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border bg-white/70 px-3 py-1.5 text-[12px] outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
