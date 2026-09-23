import test from "node:test";
import assert from "node:assert/strict";
import {
  MODEL_REGISTRY,
  VISUAL_WORKLOADS,
  TEXT_WORKLOADS,
  availableModels,
  isModelAvailable,
  modelById,
  routeModel,
} from "./model-registry";

const KEYS = [
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "REPLICATE_API_TOKEN",
  "JOON_GEMINI_TEXT_ENABLED", "JOON_NANO_BANANA_ENABLED", "JOON_NANO_BANANA_PRO_ENABLED",
  "JOON_FLUX_KONTEXT_ENABLED",
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

// --- Claude is not an image model -------------------------------------------

test("Claude is never offered for image generation", () => {
  // The Anthropic API does not return images. Listing it would be a promise
  // the API cannot keep.
  for (const model of MODEL_REGISTRY.filter((m) => m.provider === "anthropic")) {
    assert.ok(!model.capabilities.includes("image_generation"), `${model.id}`);
    assert.ok(!model.capabilities.includes("image_reference_input"), `${model.id}`);
    assert.ok(!model.outputModes.includes("image"), `${model.id}`);
  }
});

test("Claude IS available for text and visual reasoning", () => {
  const claude = modelById("claude-sonnet")!;
  assert.ok(claude.capabilities.includes("text"));
  assert.ok(claude.capabilities.includes("image_analysis"));
});

// --- real API ids, not marketing names ---------------------------------------

test("image models carry API ids, and the named ones are exact", () => {
  assert.equal(modelById("nano-banana-2")!.apiModelId, "gemini-3.1-flash-image");
  assert.equal(modelById("nano-banana-pro")!.apiModelId, "gemini-3-pro-image");
  assert.equal(modelById("openai-gpt-image")!.apiModelId, "gpt-image-1");
  // The label is what a merchant reads; the API id is what is sent.
  assert.equal(modelById("nano-banana-2")!.label, "Nano Banana 2");
});

// --- availability is earned, not assumed -------------------------------------

test("a credential alone does not enable a model", () => {
  withEnv({ GOOGLE_API_KEY: "k" }, () => {
    assert.equal(isModelAvailable(modelById("nano-banana-2")!), false);
    assert.equal(isModelAvailable(modelById("nano-banana-pro")!), false);
  });
});

test("credential plus switch enables it", () => {
  withEnv({ GOOGLE_API_KEY: "k", JOON_NANO_BANANA_ENABLED: "true" }, () => {
    assert.equal(isModelAvailable(modelById("nano-banana-2")!), true);
    assert.equal(isModelAvailable(modelById("nano-banana-pro")!), false, "Pro is its own decision");
  });
});

test("nothing configured means nothing available", () => {
  withEnv({}, () => assert.deepEqual(availableModels(), []));
});

// --- fallback cannot violate the requested capability ------------------------

test("reference-grounded work never falls back to a text-to-image model", () => {
  // The damaging case: the merchant believes they are looking at their own
  // product and it is an invention.
  withEnv({ OPENAI_API_KEY: "k" }, () => {
    const decision = routeModel({ workload: "reference_grounded_edit" });
    // gpt-image-1 does accept references, so it is legitimately capable here.
    assert.ok(decision.ok);
    assert.ok(decision.model.capabilities.includes("image_reference_input"));
  });

  // With ONLY a text-to-image model available, it must refuse rather than
  // silently produce something invented.
  withEnv({ REPLICATE_API_TOKEN: "k" }, () => {
    const decision = routeModel({ workload: "reference_grounded_edit" });
    if (decision.ok) {
      assert.ok(
        decision.model.capabilities.includes("image_reference_input"),
        `${decision.model.id} cannot take a reference and must not have been chosen`,
      );
    }
  });
});

test("an unavailable preferred model falls back only within capability", () => {
  withEnv({ OPENAI_API_KEY: "k" }, () => {
    const decision = routeModel({
      workload: "reference_grounded_edit",
      preferredModelId: "nano-banana-pro",
    });
    assert.ok(decision.ok);
    assert.equal(decision.fellBack, true);
    assert.ok(decision.model.capabilities.includes("image_reference_input"));
  });
});

test("a model that cannot do the job is refused, not substituted", () => {
  withEnv({ OPENAI_API_KEY: "k", ANTHROPIC_API_KEY: "k" }, () => {
    const decision = routeModel({ workload: "campaign_art", preferredModelId: "claude-sonnet" });
    assert.equal(decision.ok, false);
    assert.ok(!decision.ok);
    assert.match(decision.reason, /cannot do campaign art/);
  });
});

test("an unknown model id is rejected outright", () => {
  const decision = routeModel({ workload: "campaign_art", preferredModelId: "totally-made-up" });
  assert.equal(decision.ok, false);
  assert.ok(!decision.ok);
  assert.match(decision.reason, /Unknown model/);
});

test("with nothing configured, routing fails and says what is missing", () => {
  withEnv({}, () => {
    const decision = routeModel({ workload: "campaign_art" });
    assert.equal(decision.ok, false);
    assert.ok(!decision.ok);
    assert.ok(decision.missing.includes("OPENAI_API_KEY"));
    assert.ok(decision.missing.length > 1, "every route to this capability is listed");
  });
});

// --- preferences -------------------------------------------------------------

test("fast prefers the cheaper model, quality the dearer one", () => {
  withEnv({ GOOGLE_API_KEY: "k", JOON_NANO_BANANA_ENABLED: "true", JOON_NANO_BANANA_PRO_ENABLED: "true" }, () => {
    const fast = routeModel({ workload: "campaign_art", prefer: "fast" });
    const best = routeModel({ workload: "campaign_art", prefer: "quality" });
    assert.ok(fast.ok && best.ok);
    assert.equal(best.model.costClass, "premium");
    assert.notEqual(fast.model.id, best.model.id);
  });
});

// --- registry integrity ------------------------------------------------------

test("every workload maps to a capability some model declares", () => {
  for (const workload of [...TEXT_WORKLOADS, ...VISUAL_WORKLOADS]) {
    const decision = routeModel({ workload });
    // Unconfigured here, so it refuses — but it must refuse for lack of
    // credentials, never because no model could ever serve the workload.
    if (!decision.ok) {
      assert.ok(
        decision.missing.length > 0 || decision.reason.includes("No configured model"),
        `${workload} has no capable model in the registry at all`,
      );
    }
  }
});

test("every model declares cost class, credential and modes", () => {
  for (const model of MODEL_REGISTRY) {
    assert.ok(model.apiModelId.length > 0, `${model.id} needs an API id`);
    assert.ok(model.label.length > 0, `${model.id} needs a merchant label`);
    assert.ok(model.capabilities.length > 0, `${model.id} needs capabilities`);
    assert.ok(model.inputModes.length > 0, `${model.id} needs input modes`);
    assert.ok(model.outputModes.length > 0, `${model.id} needs output modes`);
    assert.ok(model.credentialEnvVar.length > 0, `${model.id} needs a credential`);
    assert.ok(["economy", "standard", "premium"].includes(model.costClass), `${model.id}`);
  }
});

test("any model taking multiple references also takes one", () => {
  for (const model of MODEL_REGISTRY.filter((m) => m.inputModes.includes("multiple_references"))) {
    assert.ok(model.inputModes.includes("image_reference"), `${model.id}`);
    assert.ok(model.capabilities.includes("image_reference_input"), `${model.id}`);
  }
});
