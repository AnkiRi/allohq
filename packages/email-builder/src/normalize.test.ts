import test from "node:test";
import assert from "node:assert/strict";
import { emailBlocksSchema, emailDocumentSchema } from "./schemas";
import {
  normalizeLegacyEmailBlocks,
  parseEmailBlocks,
  parseEmailDocument,
  safeParseEmailDocument,
} from "./normalize";

/**
 * The exact shape that took the editor down: a product block whose
 * `description` is null because `Product.description` is a nullable column and
 * template enrichment copied it straight onto the block.
 */
const BROKEN_BLOCKS = [
  { id: "b1", type: "hero", props: { heading: "Ride further" } },
  { id: "b2", type: "text", props: { html: "<p>New season</p>" } },
  { id: "b3", type: "divider", props: {} },
  {
    id: "b4",
    type: "product",
    props: { productId: "prod_1", title: "Hydrogen Board", description: null, imageUrl: null },
  },
];

test("the unfixed schema rejects blocks[3].props.description = null as invalid_union", () => {
  const result = emailBlocksSchema.safeParse(BROKEN_BLOCKS);
  assert.equal(result.success, false);
  assert.ok(!result.success);
  assert.equal(result.error.issues[0]?.code, "invalid_union");
  assert.deepEqual(result.error.issues[0]?.path, [3]);
});

test("normalizing lets the exact broken document parse", () => {
  const blocks = parseEmailBlocks(BROKEN_BLOCKS);
  assert.equal(blocks.length, 4);
  const product = blocks[3] as { props: Record<string, unknown> };
  assert.equal(product.props["title"], "Hydrogen Board");
  assert.ok(!("description" in product.props), "null description is omitted, not null");
  assert.ok(!("imageUrl" in product.props), "null imageUrl is omitted, not null");
});

test("normalization is narrow: a null in a REQUIRED prop still fails", () => {
  // text.props.html is required — a null there is genuinely corrupt and must
  // not be silently repaired.
  assert.throws(() => parseEmailBlocks([{ id: "t", type: "text", props: { html: null } }]));
});

test("normalization does not invent or drop content", () => {
  const blocks = parseEmailBlocks(BROKEN_BLOCKS) as Array<{ id: string; type: string }>;
  assert.deepEqual(blocks.map((b) => b.id), ["b1", "b2", "b3", "b4"]);
  assert.deepEqual(blocks.map((b) => b.type), ["hero", "text", "divider", "product"]);
});

test("unknown passthrough keys are left untouched, including null ones", () => {
  const blocks = parseEmailBlocks([
    { id: "p", type: "product", props: { productId: "x", handle: "board", vendor: null } },
  ]) as Array<{ props: Record<string, unknown> }>;
  assert.equal(blocks[0]?.props["handle"], "board");
  assert.equal(blocks[0]?.props["vendor"], null, "passthrough keys are not the schema's business");
});

test("nulls are normalized inside nested columns blocks", () => {
  const blocks = parseEmailBlocks([
    {
      id: "c1",
      type: "columns",
      props: {
        columns: [[{ id: "n", type: "product", props: { productId: "x", description: null } }]],
      },
    },
  ]) as Array<{ props: { columns: Array<Array<{ props: Record<string, unknown> }>> } }>;
  const nested = blocks[0]!.props.columns[0]![0]!;
  assert.ok(!("description" in nested.props));
});

test("a null in a defaulted envelope field takes the default", () => {
  const document = parseEmailDocument({
    schemaVersion: 1,
    envelope: { subject: "Hello", previewText: null, locale: "en" },
    blocks: BROKEN_BLOCKS,
    metadata: {},
  });
  assert.equal(document.envelope.previewText, "");
});

test("a normalized document is canonical: re-parsing changes nothing", () => {
  const once = parseEmailDocument({
    schemaVersion: 1,
    envelope: { subject: "Hello", previewText: null, locale: "en" },
    blocks: BROKEN_BLOCKS,
    metadata: {},
  });
  const twice = parseEmailDocument(once);
  assert.deepEqual(twice, once, "normalization is idempotent, so version hashes stay stable");
});

test("newly written canonical documents carry no null at any declared-optional key", () => {
  const document = parseEmailDocument({
    schemaVersion: 1,
    envelope: { subject: "Hello", previewText: null, locale: "en" },
    blocks: BROKEN_BLOCKS,
    metadata: {},
  });
  const declaredNulls: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) return value.forEach((item, i) => walk(item, `${path}[${i}]`));
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (child === null) declaredNulls.push(`${path}.${key}`);
        else walk(child, `${path}.${key}`);
      }
    }
  };
  walk(document, "document");
  assert.deepEqual(declaredNulls, [], "canonical documents are null-free");
});

test("safeParse reports the failure instead of throwing", () => {
  const result = safeParseEmailDocument({ envelope: { subject: "x" } });
  assert.equal(result.success, false);
});

test("normalizing an already-valid document is a no-op", () => {
  const clean = [{ id: "t", type: "text", props: { html: "<p>hi</p>" } }];
  assert.deepEqual(normalizeLegacyEmailBlocks(clean), clean);
  assert.deepEqual(emailDocumentSchema.safeParse({
    schemaVersion: 1,
    envelope: { subject: "s", previewText: "", locale: "en" },
    blocks: clean,
    metadata: {},
  }).success, true);
});
