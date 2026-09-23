import test from "node:test";
import assert from "node:assert/strict";
import {
  referenceGenerationAvailable,
  referenceProviderSetupHint,
  selectVisualProvider,
  visualProviders,
} from "./visual-provider";
import { campaignImageBudgetExceeded, imageBudgetExceeded } from "./image-budget";

const KEYS = [
  "REPLICATE_API_TOKEN",
  "OPENAI_API_KEY",
  "JOON_FLUX_KONTEXT_ENABLED",
  "JOON_OPENAI_IMAGE_REFERENCE_ENABLED",
];
function withEnv<T>(env: Record<string, string | undefined>, run: () => T): T {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(env)) if (value) process.env[key] = value;
    return run();
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key]!;
    }
  }
}

// --- failing closed ----------------------------------------------------------

test("with nothing configured, generation fails closed and names the variables", () => {
  withEnv({}, () => {
    const selection = selectVisualProvider();
    assert.equal(selection.ok, false);
    assert.ok(!selection.ok);
    assert.match(selection.reason, /No image provider is configured/);
    assert.ok(selection.missing.includes("REPLICATE_API_TOKEN"));
    assert.ok(selection.missing.includes("OPENAI_API_KEY"));
  });
});

test("failing closed never substitutes stock imagery", () => {
  withEnv({}, () => {
    const selection = selectVisualProvider();
    assert.ok(!selection.ok);
    assert.doesNotMatch(selection.reason, /stock|unsplash|placeholder/i);
  });
});

// --- reference capability ----------------------------------------------------

test("a plain Replicate token does not enable reference generation", () => {
  withEnv({ REPLICATE_API_TOKEN: "tok" }, () => {
    assert.equal(referenceGenerationAvailable(), false, "Kontext is a separate opt-in");
    const selection = selectVisualProvider({ preferReference: true });
    assert.ok(selection.ok);
    assert.equal(selection.usesReference, false);
    assert.equal(selection.provider.id, "flux");
  });
});

test("an explicit opt-in enables reference generation", () => {
  withEnv({ REPLICATE_API_TOKEN: "tok", JOON_FLUX_KONTEXT_ENABLED: "true" }, () => {
    assert.equal(referenceGenerationAvailable(), true);
    const selection = selectVisualProvider({ preferReference: true });
    assert.ok(selection.ok);
    assert.equal(selection.usesReference, true);
    assert.equal(selection.provider.id, "flux-kontext");
    assert.equal(selection.provider.capabilities.referenceImages, true);
  });
});

test("an OpenAI key alone does not enable reference generation either", () => {
  withEnv({ OPENAI_API_KEY: "sk" }, () => {
    assert.equal(referenceGenerationAvailable(), false);
    const selection = selectVisualProvider({ preferReference: true });
    assert.ok(selection.ok);
    assert.equal(selection.provider.id, "dalle");
    assert.equal(selection.usesReference, false);
  });
});

test("gpt-image-1 is used for references when opted in", () => {
  withEnv({ OPENAI_API_KEY: "sk", JOON_OPENAI_IMAGE_REFERENCE_ENABLED: "true" }, () => {
    const selection = selectVisualProvider({ preferReference: true });
    assert.ok(selection.ok);
    assert.equal(selection.provider.id, "openai-image");
    assert.equal(selection.usesReference, true);
  });
});

test("not asking for a reference does not spend on a reference provider", () => {
  withEnv({ REPLICATE_API_TOKEN: "tok", JOON_FLUX_KONTEXT_ENABLED: "true" }, () => {
    const selection = selectVisualProvider({ preferReference: false });
    assert.ok(selection.ok);
    assert.equal(selection.usesReference, false);
  });
});

test("the setup hint names exactly what an operator must set", () => {
  const hints = referenceProviderSetupHint();
  assert.equal(hints.length, 2);
  const flat = hints.flatMap((hint) => hint.variables);
  assert.ok(flat.includes("REPLICATE_API_TOKEN"));
  assert.ok(flat.includes("JOON_FLUX_KONTEXT_ENABLED=true"));
  assert.ok(flat.includes("OPENAI_API_KEY"));
  assert.ok(flat.includes("JOON_OPENAI_IMAGE_REFERENCE_ENABLED=true"));
});

// --- the registry itself -----------------------------------------------------

test("no consumer web product is a provider", () => {
  // Driving ChatGPT's or Google Flow's website would mean automating a browser
  // session against someone's personal account. Not an API, not auditable.
  for (const provider of visualProviders()) {
    assert.doesNotMatch(provider.label, /chatgpt|google flow|midjourney/i);
    assert.match(provider.credentialEnvVar, /API_(TOKEN|KEY)$/);
  }
});

test("every provider declares its reference capability and a cost", () => {
  for (const provider of visualProviders()) {
    assert.equal(typeof provider.capabilities.referenceImages, "boolean");
    assert.ok(provider.costUsd > 0, `${provider.id} needs a cost for spend accounting`);
    if (!provider.capabilities.referenceImages) {
      assert.equal(provider.capabilities.maxReferenceImages, 0);
    }
  }
});

test("reference-capable providers are preferred over text-only ones", () => {
  const ids = visualProviders().map((provider) => provider.id);
  const firstReference = ids.indexOf("flux-kontext");
  assert.ok(firstReference < ids.indexOf("flux"), "order decides what a request gets");
});

// --- spend ceilings ----------------------------------------------------------

test("both ceilings fail closed on a nonsensical budget", () => {
  assert.equal(imageBudgetExceeded(0, 0), true);
  assert.equal(imageBudgetExceeded(0, Number.NaN), true);
  assert.equal(campaignImageBudgetExceeded(0, 0), true);
  assert.equal(campaignImageBudgetExceeded(0, -1), true);
});

test("the campaign ceiling is independent of the workspace ceiling", () => {
  // One email exhausting its own allowance must not read as the workspace
  // being exhausted, and vice versa.
  assert.equal(campaignImageBudgetExceeded(2, 2), true);
  assert.equal(imageBudgetExceeded(2, 5), false);
});

test("spend at the limit stops, not just spend above it", () => {
  assert.equal(imageBudgetExceeded(5, 5), true);
  assert.equal(campaignImageBudgetExceeded(1.99, 2), false);
});
