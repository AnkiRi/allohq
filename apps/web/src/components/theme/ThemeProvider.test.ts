import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAppTheme } from "./ThemeProvider";

test("application theme defaults to Light and preserves supported values", () => {
  assert.equal(normalizeAppTheme(null), "light");
  assert.equal(normalizeAppTheme("light"), "light");
  assert.equal(normalizeAppTheme("drenched"), "drenched");
});

test("legacy application preferences migrate without reading landing values", () => {
  assert.equal(normalizeAppTheme("spectrum"), "light");
  assert.equal(normalizeAppTheme("drenched-paper"), "drenched");
  assert.equal(normalizeAppTheme("dark"), "drenched");
  assert.equal(normalizeAppTheme("mono"), "light");
  assert.equal(normalizeAppTheme("unknown"), "light");
});
