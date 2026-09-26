import test from "node:test";
import assert from "node:assert/strict";
import { applyChangeSet, applyLane, planEmailChange, readModelChangeSet } from "./email-changes";

const original = () => [
  { id: "b1", type: "hero", props: { heading: "Ride further" } },
  { id: "b2", type: "text", props: { html: "<p>New season.</p>" } },
  { id: "b3", type: "product", props: { productId: "p1", buttonText: "Shop" } },
];
let counter = 0;
const idSeed = () => `new-${counter++}`;
const plan = (content: string, scope: any, extra: Record<string, unknown> = {}) =>
  planEmailChange({ content, scope, original: original(), subject: "Ride further", previewText: "Same spirit.", idSeed, ...extra });

test("a model reply wrapped in fences and prose is still read", () => {
  const set = readModelChangeSet('Sure! ```json\n{"subject":"Winter is here"}\n``` hope that helps');
  assert.equal(set.subject, "Winter is here");
});

test("an unreadable reply changes nothing", () => {
  const result = plan("I'm afraid I can't do that.", { kind: "document" });
  assert.equal(result.ok, false);
});

// --- the invariant the Studio is built on -----------------------------------

test("a block-scoped request cannot change another block", () => {
  const result = plan(
    JSON.stringify({ blocks: { b2: { html: "<p>Rewritten.</p>" }, b1: { heading: "HIJACKED" } } }),
    { kind: "block", blockId: "b2" },
  );
  assert.ok(result.ok);
  assert.equal(result.change.blocks[1]!.props["html"], "<p>Rewritten.</p>", "the selected block changed");
  assert.equal(result.change.blocks[0]!.props["heading"], "Ride further", "the other block did not");
});

test("a block-scoped request cannot delete, add or reorder", () => {
  const result = plan(
    JSON.stringify({
      blocks: { b2: { html: "<p>ok</p>" } },
      remove: ["b1"],
      add: [{ type: "image", props: { src: "x" } }],
      order: ["b3", "b2", "b1"],
    }),
    { kind: "block", blockId: "b2" },
  );
  assert.ok(result.ok);
  assert.deepEqual(result.change.blocks.map((b) => b.id), ["b1", "b2", "b3"]);
});

test("a block-scoped request cannot change the subject", () => {
  const result = plan(
    JSON.stringify({ blocks: { b2: { html: "<p>ok</p>" } }, subject: "HIJACKED" }),
    { kind: "block", blockId: "b2" },
  );
  assert.ok(result.ok);
  assert.equal(result.change.subject, undefined);
});

test("a request that only targets other blocks is refused, not silently applied", () => {
  const result = plan(JSON.stringify({ blocks: { b1: { heading: "HIJACKED" } } }), {
    kind: "block",
    blockId: "b2",
  });
  assert.equal(result.ok, false);
});

test("whole-email scope must be asked for — it is never reached from a block", () => {
  const body = JSON.stringify({ blocks: { b1: { heading: "A" }, b3: { buttonText: "B" } }, subject: "C" });
  const contained = plan(body, { kind: "block", blockId: "b1" });
  assert.ok(contained.ok);
  assert.equal(contained.change.blocks[2]!.props["buttonText"], "Shop", "b3 untouched under block scope");

  const whole = plan(body, { kind: "document" });
  assert.ok(whole.ok);
  assert.equal(whole.change.blocks[2]!.props["buttonText"], "B", "the same reply is allowed once asked for");
  assert.equal(whole.change.subject, "C");
});

test("an envelope-scoped request cannot touch the body", () => {
  const result = plan(
    JSON.stringify({ subject: "Winter is here", blocks: { b1: { heading: "HIJACKED" } } }),
    { kind: "envelope" },
  );
  assert.ok(result.ok);
  assert.equal(result.change.subject, "Winter is here");
  assert.equal(result.change.blocks[0]!.props["heading"], "Ride further");
});

// --- lanes stay orthogonal ---------------------------------------------------

test("the copy lane cannot restructure the email", () => {
  const laned = applyLane("copy", { blocks: { b2: { html: "x" } }, remove: ["b1"], add: [{}], subject: "s" });
  assert.deepEqual(Object.keys(laned), ["blocks"]);
});

test("the subject lane cannot touch blocks", () => {
  const laned = applyLane("subject", { blocks: { b2: { html: "x" } }, subject: "s", previewText: "p" });
  assert.equal(laned.blocks, undefined);
  assert.equal(laned.subject, "s");
});

// --- applying is a proposal, never a mutation --------------------------------

test("applying never mutates the blocks it was given", () => {
  const source = original();
  const frozen = JSON.parse(JSON.stringify(source));
  applyChangeSet(source, { blocks: { b1: { heading: "changed" } }, remove: ["b3"] }, idSeed);
  assert.deepEqual(source, frozen, "the caller's array is untouched, so Reject really rejects");
});

test("a no-op change set is reported rather than proposed", () => {
  const result = plan(JSON.stringify({ blocks: {} }), { kind: "document" });
  assert.equal(result.ok, false);
});

test("a syntactically valid edit that changes no visible content is refused", () => {
  for (const change of [
    { blocks: { b1: { heading: "Ride further" } } },
    { subject: "Ride further" },
    { previewText: "Same spirit." },
    { order: ["b1", "b2", "b3"] },
  ]) {
    assert.equal(plan(JSON.stringify(change), { kind: "document" }).ok, false);
  }
});

test("added blocks get server-assigned ids, never model-chosen ones", () => {
  const result = plan(
    JSON.stringify({ add: [{ type: "divider", props: {}, id: "attacker-chosen" }] }),
    { kind: "document" },
  );
  assert.ok(result.ok);
  const added = result.change.blocks.find((b) => b.type === "divider");
  assert.ok(added);
  assert.notEqual(added.id, "attacker-chosen");
});

// --- Shopify is the truth layer ----------------------------------------------

test("the model cannot invent a product title, price or description", () => {
  const result = plan(
    JSON.stringify({
      blocks: { b3: { title: "Limited Edition Board", price: 199, description: "Handmade in Nepal." } },
    }),
    { kind: "document" },
  );
  assert.equal(result.ok, false, "an edit made only of invented facts is refused, not applied");
});

test("the model cannot swap which product a block shows", () => {
  const result = plan(
    JSON.stringify({ blocks: { b3: { productId: "some-other-product", buttonText: "Shop now" } } }),
    { kind: "document" },
  );
  assert.ok(result.ok);
  assert.equal(result.change.blocks[2]!.props["productId"], "p1", "the bound product is unchanged");
  assert.equal(result.change.blocks[2]!.props["buttonText"], "Shop now", "but wording is Joon's to edit");
  assert.deepEqual(result.stripped[0]!.props, ["productId"]);
});

test("the model cannot invent a link destination", () => {
  const withCta = [
    { id: "c1", type: "button", props: { text: "Shop", href: "https://shop.test/real" } },
  ];
  const result = planEmailChange({
    content: JSON.stringify({ blocks: { c1: { text: "Shop the drop", href: "https://not-your-store.test/x" } } }),
    scope: { kind: "document" },
    original: withCta,
    idSeed,
  });
  assert.ok(result.ok);
  assert.equal(result.change.blocks[0]!.props["href"], "https://shop.test/real", "destination unchanged");
  assert.equal(result.change.blocks[0]!.props["text"], "Shop the drop", "copy still editable");
});

test("the model cannot invent an image source", () => {
  const withImage = [{ id: "i1", type: "image", props: { src: "https://cdn.test/real.png", alt: "Board" } }];
  const result = planEmailChange({
    content: JSON.stringify({ blocks: { i1: { src: "https://example.test/made-up.png", alt: "A board on snow" } } }),
    scope: { kind: "document" },
    original: withImage,
    idSeed,
  });
  assert.ok(result.ok);
  assert.equal(result.change.blocks[0]!.props["src"], "https://cdn.test/real.png");
  assert.equal(result.change.blocks[0]!.props["alt"], "A board on snow", "alt text is Joon's to write");
});

test("a product block the model adds arrives with no product chosen", () => {
  const result = plan(
    JSON.stringify({
      add: [{ type: "product", props: { productId: "invented", title: "Invented Board", price: 1 } }],
    }),
    { kind: "document" },
  );
  assert.ok(result.ok);
  const added = result.change.blocks.find((b) => b.type === "product" && b.id !== "b3");
  assert.ok(added, "the block is still added");
  assert.deepEqual(added.props, {}, "but carries no invented facts — the merchant picks the product");
});

test("presentation stays Joon's to change", () => {
  const result = plan(
    JSON.stringify({ blocks: { b3: { showPrice: false, buttonText: "See the board" } } }),
    { kind: "document" },
  );
  assert.ok(result.ok);
  assert.equal(result.change.blocks[2]!.props["showPrice"], false);
  assert.equal(result.change.blocks[2]!.props["buttonText"], "See the board");
  assert.deepEqual(result.stripped, [], "nothing factual was attempted");
});

test("the refusal tells the merchant which picker to use", () => {
  const result = plan(JSON.stringify({ blocks: { b3: { price: 49 } } }), { kind: "document" });
  assert.equal(result.ok, false);
  assert.match(result.reason, /come from your store/);
  assert.match(result.reason, /Shopify data tab/);
});
