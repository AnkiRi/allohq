import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TEXT_ROUTE,
  describeHarnessV2,
  eligibleModels,
  normalizeModelHarnessV2,
  resolveTextRoute,
  routeForWorkload,
} from "./harness-v2";
import { TEXT_WORKLOADS, VISUAL_WORKLOADS, modelById } from "./model-registry";

function withEnv(env: Record<string, string>, run: () => void) {
  const before = { ...process.env };
  Object.assign(process.env, env);
  try {
    run();
  } finally {
    process.env = before;
  }
}

// --- capability enforcement --------------------------------------------------

test("a text model cannot be routed to image work", () => {
  // The single most important rule in this file. A browser can post anything;
  // only what survives here reaches the database.
  const harness = normalizeModelHarnessV2({
    version: 2,
    routes: { campaign_art: { primary: "claude-sonnet-5", fallbacks: [] } },
  });
  assert.equal(harness.routes.campaign_art, undefined);
});

test("an image model cannot be routed to writing", () => {
  const harness = normalizeModelHarnessV2({
    version: 2,
    routes: { short_copy: { primary: "gpt-image-flare", fallbacks: [] } },
  });
  assert.equal(harness.routes.short_copy, undefined);
});

test("a fallback that cannot do the job is dropped, the route is kept", () => {
  const harness = normalizeModelHarnessV2({
    version: 2,
    routes: {
      campaign_art: { primary: "gpt-image-flare", fallbacks: ["claude-sonnet-5", "nano-banana-2"] },
    },
  });
  assert.deepEqual(harness.routes.campaign_art, {
    primary: "gpt-image-flare",
    fallbacks: ["nano-banana-2"],
  });
});

test("product-in-a-scene only offers models that take the real photo as input", () => {
  for (const model of eligibleModels("product_reference_edit")) {
    assert.ok(
      model.capabilities.includes("image_reference_input"),
      `${model.id} cannot receive the merchant's product image`,
    );
  }
});

test("Claude is offered for every text job and no visual one", () => {
  for (const workload of TEXT_WORKLOADS) {
    assert.ok(eligibleModels(workload).some((m) => m.provider === "anthropic"));
  }
  for (const workload of VISUAL_WORKLOADS) {
    assert.ok(
      !eligibleModels(workload).some((m) => m.provider === "anthropic"),
      `Claude must not be offered for ${workload}`,
    );
  }
});

test("an invented model id is discarded rather than stored", () => {
  const harness = normalizeModelHarnessV2({
    version: 2,
    routes: { short_copy: { primary: "gpt-5-ultra", fallbacks: [] } },
  });
  assert.equal(harness.routes.short_copy, undefined);
});

test("a primary listed again as its own fallback is deduplicated", () => {
  const harness = normalizeModelHarnessV2({
    version: 2,
    routes: { short_copy: { primary: "claude-sonnet-5", fallbacks: ["claude-sonnet-5", "gpt-4o-mini"] } },
  });
  assert.deepEqual(harness.routes.short_copy?.fallbacks, ["gpt-4o-mini"]);
});

// --- carrying v1 forward -----------------------------------------------------

test("a v1 unified harness keeps the model it was set to", () => {
  const harness = normalizeModelHarnessV2({
    version: 1,
    mode: "unified",
    defaultRoute: { primary: "claude-haiku-4-5-20251001", fallbacks: ["gpt-4o-mini"] },
    routes: {},
  });
  assert.equal(harness.textDefault.primary, "claude-haiku-4-5-20251001");
  assert.deepEqual(harness.textDefault.fallbacks, ["gpt-4o-mini"]);
});

test("a v1 creative route reaches all four writing jobs it became", () => {
  const harness = normalizeModelHarnessV2({
    version: 1,
    mode: "custom",
    defaultRoute: { primary: "claude-sonnet-5", fallbacks: [] },
    routes: { creative: { primary: "claude-haiku-4-5-20251001", fallbacks: [] } },
  });
  for (const workload of ["email_structure", "short_copy", "long_content", "brand_refinement"] as const) {
    assert.equal(harness.routes[workload]?.primary, "claude-haiku-4-5-20251001", workload);
  }
});

test("nothing configured falls back to Joon's own default, not to nothing", () => {
  const harness = normalizeModelHarnessV2(undefined);
  assert.deepEqual(harness.textDefault, DEFAULT_TEXT_ROUTE);
  assert.equal(routeForWorkload(harness, "long_content").source, "text_default");
  assert.equal(routeForWorkload(harness, "campaign_art").source, "joon");
});

// --- what settings is told ---------------------------------------------------

test("every workload appears exactly once, labelled text or visual", () => {
  const rows = describeHarnessV2(normalizeModelHarnessV2(undefined));
  assert.equal(rows.length, TEXT_WORKLOADS.length + VISUAL_WORKLOADS.length);
  assert.equal(rows.filter((row) => row.kind === "visual").length, VISUAL_WORKLOADS.length);
  assert.equal(new Set(rows.map((row) => row.workload)).size, rows.length);
});

test("a job is reported unrunnable when nothing behind it is configured", () => {
  withEnv({ ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", GOOGLE_API_KEY: "" }, () => {
    const rows = describeHarnessV2(normalizeModelHarnessV2(undefined));
    assert.ok(rows.every((row) => !row.runnable), "no credential can mean no runnable job");
  });
});

test("a configured credential makes exactly the jobs it can serve runnable", () => {
  withEnv({ ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "", GOOGLE_API_KEY: "" }, () => {
    const rows = describeHarnessV2(normalizeModelHarnessV2(undefined));
    // Anthropic returns no images, so an Anthropic-only workspace can write
    // but cannot make a picture — and settings must say so.
    assert.ok(rows.filter((row) => row.kind === "text").every((row) => row.runnable));
    assert.ok(rows.filter((row) => row.kind === "visual").every((row) => !row.runnable));
  });
});

test("the legacy image model is never what an unconfigured visual job resolves to", () => {
  const rows = describeHarnessV2(normalizeModelHarnessV2(undefined));
  for (const row of rows.filter((r) => r.kind === "visual")) {
    assert.notEqual(row.primary, "gpt-image-1-legacy");
    assert.equal(modelById("gpt-image-1-legacy")?.tier, "legacy");
  }
});

test("per-route generation defaults survive the move from v1", () => {
  const harness = normalizeModelHarnessV2({
    version: 1,
    mode: "custom",
    defaultRoute: { primary: "claude-sonnet-4-6", fallbacks: [] },
    routes: { creative: { primary: "claude-sonnet-5", fallbacks: [], temperature: 0.9, maxTokens: 6000 } },
  });
  assert.equal(harness.routes.short_copy?.temperature, 0.9);
  assert.equal(harness.routes.short_copy?.maxTokens, 6000);
});

// --- resolution ---------------------------------------------------------------

test("a configured route is attempted first, then Joon's own chain", () => {
  const route = resolveTextRoute({
    workload: "short_copy",
    harness: {
      version: 2,
      textDefault: { primary: "claude-sonnet-4-6", fallbacks: [] },
      routes: { short_copy: { primary: "gpt-4o-mini", fallbacks: ["claude-haiku-4-5-20251001"] } },
    },
  });
  assert.equal(route.source, "harness_workload");
  assert.deepEqual(route.candidates.slice(0, 2), ["gpt-4o-mini", "claude-haiku-4-5-20251001"]);
  assert.ok(route.candidates.length > 2, "the policy chain still follows, so an outage degrades");
});

test("a workload with no route of its own uses the text default", () => {
  const route = resolveTextRoute({
    workload: "long_content",
    harness: { version: 2, textDefault: { primary: "claude-haiku-4-5-20251001", fallbacks: [] }, routes: {} },
  });
  assert.equal(route.source, "harness_default");
  assert.equal(route.candidates[0], "claude-haiku-4-5-20251001");
});

test("an explicit model stays a one-off override", () => {
  const route = resolveTextRoute({
    model: "gpt-4o-mini",
    workload: "short_copy",
    harness: { version: 2, textDefault: { primary: "claude-sonnet-5", fallbacks: [] }, routes: {} },
  });
  assert.equal(route.source, "explicit");
  assert.equal(route.candidates[0], "gpt-4o-mini");
});

test("no harness at all means Joon's policy, not an empty chain", () => {
  const route = resolveTextRoute({ task: "classification" });
  assert.equal(route.source, "system_policy");
  assert.ok(route.candidates.length > 0);
});

test("a job with no model behind it is not offered as a choice", () => {
  // image_analysis has no adapter. Listing it in settings would imply a
  // capability Joon does not have; it is withheld until one exists.
  assert.equal(eligibleModels("image_analysis").length, 0);

  const offered = [...TEXT_WORKLOADS, ...VISUAL_WORKLOADS].filter(
    (workload) => eligibleModels(workload).length > 0,
  );
  assert.ok(!offered.includes("image_analysis" as never));
  assert.equal(offered.length, TEXT_WORKLOADS.length + VISUAL_WORKLOADS.length - 1);
});
