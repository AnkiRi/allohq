import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReferenceAssets } from "./ReferenceAssets";
import { VersionsPanel } from "./StudioVersions";
import { AskPanel } from "./StudioAskPanel";

test("same-named references have individual visible thumbnails and selection", () => {
  const html = renderToStaticMarkup(createElement(ReferenceAssets, { assets: [
    { id: "1", fileName: "Clean hero.png", url: "https://cdn.test/1.png" },
    { id: "2", fileName: "Clean hero.png", url: "https://cdn.test/2.png" },
  ], selectedId: "2", onSelect: () => {} }));
  assert.match(html, /cdn.test\/1.png/); assert.match(html, /cdn.test\/2.png/);
  assert.equal((html.match(/<img /g) ?? []).length, 2);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /does not affect copy suggestions/);
});
test("saved version history has separate View and Restore actions", () => {
  const html = renderToStaticMarkup(createElement(VersionsPanel, { versions: [], cursor: 0, restore: () => {}, durableVersions: [{ id: "1", sequence: 14, source: "manual", createdAt: "2026-09-28", document: {} }], restoreDurable: () => {}, viewDurable: () => {}, restoring: false }));
  assert.match(html, /View version 14/); assert.match(html, /Restore version 14/);
  assert.match(html, /retained after sending/); assert.doesNotMatch(html, /Restoring creates a new version/);
});
test("copy assistance does not pretend reference uploads influence the model", () => {
  const html = renderToStaticMarkup(createElement(AskPanel, { visualProposal: null, onVisualGenerate: () => {}, onVisualRefine: () => {}, onVisualCancel: () => {}, inputRef: { current: null }, selected: { id: "cta", type: "button", props: { text: "Shop", href: "#" } }, scope: "block", setScope: () => {}, instruction: "", setInstruction: () => {}, pending: false, error: null, onAsk: () => {}, history: [] }));
  assert.doesNotMatch(html, /Reference assets|Upload/);
  assert.match(html, /Make the button full width/);
});
