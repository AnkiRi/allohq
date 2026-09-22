import test from "node:test";
import assert from "node:assert/strict";
import { containToScope, describeScope, scopeViolation } from "./email-scope";

const blocks = () => [
  { id: "b1", type: "hero", props: { heading: "Ride further" } },
  { id: "b2", type: "text", props: { html: "<p>New season.</p>" } },
  { id: "b3", type: "product", props: { productId: "p1", buttonText: "Shop" } },
];
const quiet = { subjectChanged: false, previewTextChanged: false };

test("a block-scoped request keeps only that block's edit", () => {
  const contained = containToScope(
    { kind: "block", blockId: "b2" },
    {
      blocks: { b2: { html: "<p>Rewritten.</p>" }, b1: { heading: "Hijacked" } },
      add: [{ type: "image", props: {} }],
      remove: ["b3"],
      order: ["b3", "b2", "b1"],
      subject: "New subject",
      previewText: "New preview",
    },
  );
  assert.deepEqual(contained, { blocks: { b2: { html: "<p>Rewritten.</p>" } } });
});

test("a model that ignores its scope cannot reach another block", () => {
  const contained = containToScope({ kind: "block", blockId: "b2" }, {
    blocks: { b1: { heading: "Hijacked" }, b3: { buttonText: "Hijacked" } },
  });
  assert.deepEqual(contained, {}, "nothing survives when the scoped block was not addressed");
});

test("a block-scoped request cannot add, remove or reorder", () => {
  const contained = containToScope({ kind: "block", blockId: "b1" }, {
    add: [{ type: "product_grid", props: {} }],
    remove: ["b2"],
    order: ["b3", "b1", "b2"],
  });
  assert.equal(contained.add, undefined);
  assert.equal(contained.remove, undefined);
  assert.equal(contained.order, undefined);
});

test("an envelope-scoped request cannot touch the body", () => {
  const contained = containToScope({ kind: "envelope" }, {
    subject: "Ride further",
    previewText: "Same spirit.",
    blocks: { b1: { heading: "Hijacked" } },
    remove: ["b2"],
  });
  assert.deepEqual(contained, { subject: "Ride further", previewText: "Same spirit." });
});

test("whole-email scope is the only one that passes everything through", () => {
  const changes = { blocks: { b1: { heading: "x" } }, remove: ["b2"], subject: "s" };
  assert.deepEqual(containToScope({ kind: "document" }, changes), changes);
});

test("whole-email scope is never inferred — it has to be asked for", () => {
  // The only way to reach document scope is to pass it explicitly; a block
  // selection produces block scope and nothing else.
  const contained = containToScope({ kind: "block", blockId: "b1" }, { subject: "s" });
  assert.deepEqual(contained, {});
});

test("the post-condition catches an out-of-scope block change", () => {
  const next = blocks();
  next[0]!.props = { heading: "Changed behind our back" };
  const reason = scopeViolation({ kind: "block", blockId: "b2" }, blocks(), next, quiet);
  assert.match(reason ?? "", /changed "b1" as well/);
});

test("the post-condition catches a smuggled add, remove or reorder", () => {
  const removed = blocks().filter((b) => b.id !== "b3");
  assert.match(
    scopeViolation({ kind: "block", blockId: "b2" }, blocks(), removed, quiet) ?? "",
    /may not add or remove blocks/,
  );
  const reordered = [blocks()[2]!, blocks()[1]!, blocks()[0]!];
  assert.match(
    scopeViolation({ kind: "block", blockId: "b2" }, blocks(), reordered, quiet) ?? "",
    /may not reorder blocks/,
  );
});

test("the post-condition catches a smuggled subject change", () => {
  assert.match(
    scopeViolation({ kind: "block", blockId: "b2" }, blocks(), blocks(), {
      subjectChanged: true,
      previewTextChanged: false,
    }) ?? "",
    /may not change the subject/,
  );
});

test("an in-scope edit passes the post-condition", () => {
  const next = blocks();
  next[1]!.props = { html: "<p>Rewritten.</p>" };
  assert.equal(scopeViolation({ kind: "block", blockId: "b2" }, blocks(), next, quiet), null);
});

test("an envelope edit that leaves the body alone passes", () => {
  assert.equal(
    scopeViolation({ kind: "envelope" }, blocks(), blocks(), {
      subjectChanged: true,
      previewTextChanged: true,
    }),
    null,
  );
});

test("scopes describe themselves for the UI label", () => {
  assert.equal(describeScope({ kind: "block", blockId: "b1" }), "this block");
  assert.equal(describeScope({ kind: "envelope" }), "the subject and inbox preview");
  assert.equal(describeScope({ kind: "document" }), "the whole email");
});
