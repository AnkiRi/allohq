import test from "node:test";
import assert from "node:assert/strict";
import {
  MODEL_REGISTRY,
  TEXT_WORKLOADS,
  VISUAL_WORKLOADS,
  availableModels,
  isKnownModelId,
  isModelAvailable,
  modelById,
  routeModel,
} from "./model-registry";

const KEYS = [
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "REPLICATE_API_TOKEN",
  "JOON_GEMINI_TEXT_ENABLED", "JOON_NANO_BANANA_ENABLED", "JOON_NANO_BANANA_PRO_ENABLED",
  "JOON_OPENAI_IMAGE_ENABLED", "JOON_OPENAI_IMAGE_LEGACY_ENABLED",
];
function withEnv<T>(env: Record<string, string | undefined>, run: () => T): T {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const k of KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(env)) if (v) process.env[k] = v;
    return run();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
  }
}

// --- a registry entry is not an implementation -------------------------------

test("every registered model is backed by a real adapter", () => {
  for (const model of MODEL_REGISTRY) {
    assert.ok(model.adapter, `${model.id} has no adapter`);
    if (model.adapter.kind === "visual") {
      assert.equal(typeof model.adapter.impl.generate, "function", `${model.id}`);
      assert.equal(typeof model.adapter.impl.isConfigured, "function", `${model.id}`);
    } else {
      assert.ok(["anthropic", "openai", "google"].includes(model.adapter.provider), `${model.id}`);
    }
  }
});

test("no declared-only provider survives in the registry", () => {
  // Flux/Replicate was listed with no VisualAdapter behind it. Declaring a
  // model a merchant can select but Joon cannot run is false availability.
  assert.equal(MODEL_REGISTRY.filter((m) => (m.provider as string) === "replicate").length, 0);
  for (const model of MODEL_REGISTRY) {
    assert.ok(["openai", "anthropic", "google"].includes(model.provider), `${model.id}`);
  }
});

// --- Anthropic is not an image model -----------------------------------------

test("Anthropic never appears in any image capability", () => {
  for (const model of MODEL_REGISTRY.filter((m) => m.provider === "anthropic")) {
    assert.ok(!model.capabilities.includes("image_generation"));
    assert.ok(!model.capabilities.includes("image_reference_input"));
    assert.ok(!model.outputModes.includes("image"));
  }
});

// --- the named models, with real API ids -------------------------------------

test("the current OpenAI image path is GPT Image 2.5, not the older models", () => {
  assert.equal(modelById("gpt-image-flare")!.apiModelId, "gpt-image-2.5-flare");
  assert.equal(modelById("gpt-image-sunburst")!.apiModelId, "gpt-image-2.5-sunburst");
  assert.equal(modelById("gpt-image-flare")!.tier, "fast");
  assert.equal(modelById("gpt-image-sunburst")!.tier, "premium");
  // gpt-image-1 survives only as an explicitly labelled legacy option.
  const legacy = modelById("gpt-image-1-legacy")!;
  assert.equal(legacy.tier, "legacy");
  assert.match(legacy.label, /legacy/i);
  assert.ok(legacy.enableEnvVar, "legacy needs its own switch");
});

test("Nano Banana ids are exact", () => {
  assert.equal(modelById("nano-banana-2")!.apiModelId, "gemini-3.1-flash-image");
  assert.equal(modelById("nano-banana-pro")!.apiModelId, "gemini-3-pro-image");
  assert.equal(modelById("nano-banana-2")!.tier, "recommended");
});

test("no model states a flat per-image price", () => {
  // Providers bill by tokens and tiers; a printed "$0.04 per image" would be a
  // number Joon invented. Real spend is recorded from provider usage.
  for (const model of MODEL_REGISTRY) {
    assert.ok(!("costUsd" in model), `${model.id} must not claim a flat price`);
    assert.ok(["economy", "standard", "premium"].includes(model.costClass));
  }
});

// --- availability ------------------------------------------------------------

test("a credential alone enables nothing that has a switch", () => {
  withEnv({ GOOGLE_API_KEY: "k" }, () => {
    assert.equal(isModelAvailable(modelById("nano-banana-2")!), false);
    assert.equal(isModelAvailable(modelById("gemini-text")!), false);
  });
});

test("credential plus switch enables exactly that model", () => {
  withEnv({ GOOGLE_API_KEY: "k", JOON_NANO_BANANA_ENABLED: "true" }, () => {
    assert.equal(isModelAvailable(modelById("nano-banana-2")!), true);
    assert.equal(isModelAvailable(modelById("nano-banana-pro")!), false, "Pro is its own decision");
  });
});

test("nothing configured means nothing available", () => {
  withEnv({}, () => assert.deepEqual(availableModels(), []));
});

// --- fallback cannot violate capability --------------------------------------

test("product-reference work never falls back to a text-only image model", () => {
  withEnv({ OPENAI_API_KEY: "k", JOON_OPENAI_IMAGE_ENABLED: "true" }, () => {
    const decision = routeModel({ workload: "product_reference_edit" });
    assert.ok(decision.ok);
    assert.ok(
      decision.model.capabilities.includes("image_reference_input"),
      `${decision.model.id} cannot take the real product`,
    );
  });
});

test("asking to be product-faithful tightens the requirement", () => {
  withEnv({ OPENAI_API_KEY: "k", JOON_OPENAI_IMAGE_ENABLED: "true" }, () => {
    const decision = routeModel({ workload: "campaign_art", prefer: "product_faithful" });
    assert.ok(decision.ok);
    assert.ok(decision.model.capabilities.includes("image_reference_input"));
  });
});

test("supplying a reference forces a reference-capable model", () => {
  withEnv({ OPENAI_API_KEY: "k", JOON_OPENAI_IMAGE_ENABLED: "true" }, () => {
    const decision = routeModel({ workload: "campaign_art", hasReference: true });
    assert.ok(decision.ok);
    assert.ok(decision.model.capabilities.includes("image_reference_input"));
  });
});

test("a model that cannot do the job is refused, not substituted", () => {
  withEnv({ ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "k", JOON_OPENAI_IMAGE_ENABLED: "true" }, () => {
    const decision = routeModel({ workload: "campaign_art", preferredModelId: "claude-sonnet" });
    assert.equal(decision.ok, false);
    assert.ok(!decision.ok);
    assert.match(decision.reason, /cannot do this job/);
  });
});

test("a model id the browser invented is rejected", () => {
  assert.equal(isKnownModelId("gpt-9-ultra"), false);
  const decision = routeModel({ workload: "campaign_art", preferredModelId: "gpt-9-ultra" });
  assert.equal(decision.ok, false);
  assert.ok(!decision.ok);
  assert.match(decision.reason, /Unknown model/);
});

test("with nothing configured, routing refuses and lists what is missing", () => {
  withEnv({}, () => {
    const decision = routeModel({ workload: "campaign_art" });
    assert.equal(decision.ok, false);
    assert.ok(!decision.ok);
    assert.ok(decision.missing.includes("OPENAI_API_KEY"));
  });
});

test("image_analysis has no implemented model and says so rather than routing", () => {
  // Registered as a capability with no adapter that reads text from an image.
  withEnv({ OPENAI_API_KEY: "k", GOOGLE_API_KEY: "k", ANTHROPIC_API_KEY: "k" }, () => {
    const decision = routeModel({ workload: "image_analysis" });
    assert.equal(decision.ok, false, "nothing may claim OCR or image analysis");
  });
});

// --- preferences -------------------------------------------------------------

test("fast and premium pick different models when both are configured", () => {
  withEnv({ GOOGLE_API_KEY: "k", JOON_NANO_BANANA_ENABLED: "true", JOON_NANO_BANANA_PRO_ENABLED: "true" }, () => {
    const fast = routeModel({ workload: "campaign_art", prefer: "fast" });
    const premium = routeModel({ workload: "campaign_art", prefer: "premium" });
    assert.ok(fast.ok && premium.ok);
    assert.equal(premium.model.tier, "premium");
    assert.notEqual(fast.model.id, premium.model.id);
  });
});

test("every text workload can be served once a text model is configured", () => {
  withEnv({ ANTHROPIC_API_KEY: "k" }, () => {
    for (const workload of TEXT_WORKLOADS) {
      const decision = routeModel({ workload });
      assert.ok(decision.ok, `${workload} could not route`);
      assert.ok(decision.model.capabilities.includes("text"));
    }
  });
});

test("visual workloads route only to models that output images", () => {
  withEnv({ GOOGLE_API_KEY: "k", JOON_NANO_BANANA_ENABLED: "true" }, () => {
    for (const workload of VISUAL_WORKLOADS) {
      const decision = routeModel({ workload });
      if (decision.ok) assert.ok(decision.model.outputModes.includes("image"), `${workload}`);
    }
  });
});
