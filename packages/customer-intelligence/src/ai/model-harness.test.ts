import assert from "node:assert/strict";
import test from "node:test";
import { normalizeModelHarness } from "./model-harness";

test("untrusted JSON cannot route to an unknown model", () => {
  const harness = normalizeModelHarness({
    version: 999,
    mode: "custom",
    defaultRoute: {
      primary: "invented-model",
      fallbacks: ["also-invented"],
      temperature: 99,
      maxTokens: -1,
    },
    routes: {
      creative: {
        primary: "gpt-4o-mini",
        fallbacks: ["invented-model", "claude-sonnet-4-6"],
      },
      inventedWorkload: {
        primary: "gpt-4o-mini",
      },
    },
  });

  assert.equal(harness.version, 1);
  assert.notEqual(harness.defaultRoute.primary, "invented-model");
  assert.deepEqual(harness.routes.creative?.fallbacks, [
    "claude-sonnet-4-6",
  ]);
  assert.equal(
    (harness.routes as Record<string, unknown>).inventedWorkload,
    undefined,
  );
});
