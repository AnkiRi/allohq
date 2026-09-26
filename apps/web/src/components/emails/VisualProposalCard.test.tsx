import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VisualProposalCard } from "./VisualProposalCard";

test("renders the proposal shape returned by the Studio API without crashing", () => {
  const proposal = {
    instruction: "Put this product in a model's hand",
    kind: "product_reference_edit",
    targetDescription: "A new image block",
    product: null,
    mode: "creative_concept" as const,
    modeLabel: "Creative concept",
    providerLabel: "Image model",
    referenceGrounded: false,
    costClass: "standard" as const,
    blockedReason: null,
  };
  const markup = renderToStaticMarkup(createElement(VisualProposalCard, {
    proposal,
    onGenerate: () => {},
    onRefine: () => {},
    onCancel: () => {},
  }));
  assert.match(markup, /Joon would make a visual/);
  assert.match(markup, /Cost/);
  assert.match(markup, /standard/);
});
