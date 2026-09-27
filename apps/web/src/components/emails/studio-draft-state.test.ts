import test from "node:test";
import assert from "node:assert/strict";
import type { EmailBlock } from "@allohq/email-builder";
import { countStudioDraftChanges, matchingStudioVersion, type StudioDraftContent } from "./studio-draft-state";

const block = (id: string, text: string) => ({ id, type: "button", props: { text, href: "https://joonhq.com" } }) as EmailBlock;
const content = (blocks: EmailBlock[]): StudioDraftContent => ({ blocks, subject: "Winter", previewText: "New boards" });

test("counts edited fields without counting every shifted block after an insertion", () => {
  const saved = content([block("one", "Shop"), block("two", "Explore")]);
  const draft = { ...content([block("new", "See more"), block("one", "Buy"), block("two", "Explore")]), subject: "Winter sale" };
  assert.equal(countStudioDraftChanges(saved, draft), 3);
});

test("counts a real reorder once and ignores object key order", () => {
  const saved = content([block("one", "Shop"), block("two", "Explore")]);
  const reordered = content([block("two", "Explore"), block("one", "Shop")]);
  assert.equal(countStudioDraftChanges(saved, reordered), 1);
  const same = content([{ id: "one", type: "button", props: { href: "https://joonhq.com", text: "Shop" } } as EmailBlock, block("two", "Explore")]);
  assert.equal(countStudioDraftChanges(saved, same), 0);
});

test("finds an older matching version after a restore, not merely the highest number", () => {
  const draft = content([block("one", "Shop")]);
  const versions = [
    { sequence: 5, document: { blocks: [block("one", "Buy")], envelope: { subject: "Winter", previewText: "New boards" } } },
    { sequence: 2, document: { blocks: [block("one", "Shop")], envelope: { subject: "Winter", previewText: "New boards" } } },
  ];
  assert.equal(matchingStudioVersion(versions, draft), 2);
});
