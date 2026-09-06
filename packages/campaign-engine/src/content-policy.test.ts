import test from "node:test";
import assert from "node:assert/strict";
import { findBannedTerms } from "./content-policy";

test("merchant banned terms are detected case-insensitively in structured email content", () => {
  assert.deepEqual(findBannedTerms({ subject: "A CHEAP shortcut", blocks: [{ text: "No spam here" }] }, ["cheap", "Spam", ""]), ["cheap", "Spam"]);
});
