import test from "node:test";
import assert from "node:assert/strict";
import { proposalPreviewState } from "./proposal-preview";

const base = JSON.stringify({ blocks: [{ id: "button", text: "Shop now" }] });
const candidate = JSON.stringify({ blocks: [{ id: "button", text: "Shop now with 25% off" }] });

test("a current proposal can be compared without changing the draft", () => {
  const proposal = { baseSignature: base, candidateSignature: candidate };
  assert.deepEqual(proposalPreviewState(base, proposal, "before"), { showProposed: false, notice: null });
  assert.deepEqual(proposalPreviewState(base, proposal, "proposed"), { showProposed: true, notice: null });
});

test("a manual image edit makes the current draft win over an old proposal", () => {
  const withImage = JSON.stringify({ blocks: [{ id: "button", text: "Shop now" }, { id: "image" }] });
  const state = proposalPreviewState(withImage, { baseSignature: base, candidateSignature: candidate }, "proposed");
  assert.equal(state.showProposed, false);
  assert.match(state.notice ?? "", /current draft is shown/);
});

test("a restored stale or no-op proposal never replaces the current canvas", () => {
  assert.equal(proposalPreviewState(base, { baseSignature: base, candidateSignature: candidate, stale: true }, "proposed").showProposed, false);
  assert.equal(proposalPreviewState(base, { baseSignature: base, candidateSignature: base }, "proposed").showProposed, false);
  assert.deepEqual(proposalPreviewState(base, null, "proposed"), { showProposed: false, notice: null });
});
