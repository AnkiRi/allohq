import test from "node:test";
import assert from "node:assert/strict";
import {
  describeMigration,
  migrateHarnessRoutes,
  migrationPreservesRoutes,
  unroutedWorkloads,
} from "./harness-migration";
import { AI_WORKLOADS, DEFAULT_MODEL_HARNESS, type ModelHarnessConfig } from "./model-harness";

const route = (primary: string) => ({ primary, fallbacks: [] }) as never;

function harness(routes: Record<string, unknown>): ModelHarnessConfig {
  return { ...DEFAULT_MODEL_HARNESS, mode: "custom", routes: routes as never };
}

test("no workspace loses a route it had configured", () => {
  const before = harness(Object.fromEntries(AI_WORKLOADS.map((w) => [w, route("claude-sonnet-4-6")])));
  assert.equal(migrationPreservesRoutes(before), true);
  const after = migrateHarnessRoutes(before);
  for (const workload of AI_WORKLOADS) {
    assert.ok(
      describeMigration(workload).some((target) => after[target]),
      `${workload} lost its route`,
    );
  }
});

test("the single creative route becomes all four creative jobs", () => {
  const after = migrateHarnessRoutes(harness({ creative: route("gpt-4o") }));
  for (const workload of ["email_structure", "short_copy", "long_content", "brand_refinement"] as const) {
    assert.equal(after[workload]?.primary, "gpt-4o", `${workload} did not inherit it`);
  }
});

test("support and orchestration merge without one clobbering the other", () => {
  const after = migrateHarnessRoutes(harness({
    support: route("claude-sonnet-4-6"),
    orchestration: route("gpt-4o"),
  }));
  // Deterministic: the first configured wins, so the result does not depend
  // on object key order.
  assert.equal(after["merchant_agent_orchestration"]?.primary, "claude-sonnet-4-6");
});

test("a partially configured harness keeps exactly what it had", () => {
  const after = migrateHarnessRoutes(harness({ analysis: route("gpt-4o") }));
  assert.equal(after["analysis"]?.primary, "gpt-4o");
  assert.equal(after["strategy"], undefined, "nothing is invented for workloads that had none");
});

test("an untouched harness migrates to nothing, not to wrong defaults", () => {
  const after = migrateHarnessRoutes(harness({}));
  assert.deepEqual(after, {});
  assert.equal(migrationPreservesRoutes(harness({})), true);
});

test("fallback chains survive and are copied, not shared", () => {
  const source = harness({ strategy: { primary: "a", fallbacks: ["b", "c"] } as never });
  const after = migrateHarnessRoutes(source);
  assert.deepEqual(after["strategy"]?.fallbacks, ["b", "c"]);
  (after["strategy"]!.fallbacks as string[]).push("d");
  assert.deepEqual((source.routes as never as Record<string, { fallbacks: string[] }>)["strategy"]!.fallbacks, ["b", "c"], "the original is untouched");
});

test("workloads with no route are reported rather than silently defaulted", () => {
  const unrouted = unroutedWorkloads(migrateHarnessRoutes(harness({ creative: route("gpt-4o") })));
  assert.ok(unrouted.includes("strategy"));
  assert.ok(!unrouted.includes("short_copy"), "short_copy inherited the creative route");
});
