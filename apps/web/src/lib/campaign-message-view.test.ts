import assert from "node:assert/strict";
import test from "node:test";
import { campaignMessageView } from "./campaign-message-view";

test("sent campaigns show the frozen approved document, not a later library edit", () => {
  const view = campaignMessageView({
    status: "sent",
    template: { blocks: [{ id: "new", type: "text" }], html: "new HTML" },
    approvedEmailVersion: { contentHash: "approved-v1", document: { blocks: [{ id: "approved", type: "text" }] } },
  });
  assert.equal(view.editable, false);
  assert.equal(view.frozen, true);
  assert.deepEqual(view.blocks, [{ id: "approved", type: "text" }]);
  assert.equal(view.html, null);
});

test("draft campaigns remain editable and show their current template", () => {
  const view = campaignMessageView({ status: "draft", template: { blocks: [{ id: "draft" }], html: null } });
  assert.equal(view.editable, true);
  assert.deepEqual(view.blocks, [{ id: "draft" }]);
});

test("approved campaigns with no readable snapshot fail closed instead of showing a later template", () => {
  const view = campaignMessageView({
    status: "sent",
    template: { blocks: [{ id: "mutated" }], html: "mutated HTML" },
    approvedEmailVersion: null,
  });
  assert.equal(view.editable, false);
  assert.equal(view.frozen, false);
  assert.equal(view.blocks, null);
  assert.equal(view.html, null);
});
