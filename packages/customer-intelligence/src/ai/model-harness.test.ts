import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeModelHarness,
  resolveHarnessRoute,
  type ModelHarnessConfig,
} from "./model-harness";

const customHarness: ModelHarnessConfig = {
  version: 1,
  mode: "custom",
  defaultRoute: {
    primary: "claude-sonnet-4-6",
    fallbacks: ["gpt-4o-mini"],
  },
  routes: {
    creative: {
      primary: "claude-sonnet-5",
      fallbacks: ["claude-sonnet-4-6"],
      temperature: 0.9,
      maxTokens: 6_000,
    },
    classification: {
      primary: "gpt-4o-mini",
      fallbacks: ["claude-haiku-4-5-20251001"],
      temperature: 0,
      maxTokens: 800,
    },
  },
};

test("a unified harness routes every workload through its default", () => {
  const route = resolveHarnessRoute({
    workload: "creative",
    harness: {
      ...customHarness,
      mode: "unified",
    },
  });

  assert.equal(route.source, "harness_default");
  assert.equal(route.candidates[0], "claude-sonnet-4-6");
});

test("a custom harness resolves workload model and generation defaults", () => {
  const route = resolveHarnessRoute({
    workload: "creative",
    harness: customHarness,
  });

  assert.equal(route.source, "harness_workload");
  assert.deepEqual(route.candidates.slice(0, 2), [
    "claude-sonnet-5",
    "claude-sonnet-4-6",
  ]);
  assert.equal(route.temperature, 0.9);
  assert.equal(route.maxTokens, 6_000);
});

test("an explicit model remains a one-off override", () => {
  const route = resolveHarnessRoute({
    model: "gpt-4o-mini",
    workload: "creative",
    harness: customHarness,
  });

  assert.equal(route.source, "explicit");
  assert.equal(route.candidates[0], "gpt-4o-mini");
});

test("task names map to stable product workloads", () => {
  const route = resolveHarnessRoute({
    task: "classification",
    harness: customHarness,
  });

  assert.equal(route.workload, "classification");
  assert.equal(route.candidates[0], "gpt-4o-mini");
});

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
