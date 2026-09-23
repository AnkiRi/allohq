import test from "node:test";
import assert from "node:assert/strict";
import { planGeneration, refusalFromAdapterError } from "./visual-generation";
import { VisualAdapterError } from "@allohq/customer-intelligence";

const KEYS = [
  "ASSET_BUCKET", "ASSET_CDN_BASE_URL", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
  "OPENAI_API_KEY", "GOOGLE_API_KEY", "ANTHROPIC_API_KEY",
  "JOON_OPENAI_IMAGE_ENABLED", "JOON_NANO_BANANA_ENABLED", "JOON_NANO_BANANA_PRO_ENABLED",
  "JOON_OPENAI_IMAGE_LEGACY_ENABLED",
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
const STORAGE = {
  ASSET_BUCKET: "b", ASSET_CDN_BASE_URL: "https://cdn", AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "s",
};

test("storage is checked before anything else, so nothing is spent unsaveably", () => {
  withEnv({ GOOGLE_API_KEY: "k", JOON_NANO_BANANA_ENABLED: "true" }, () => {
    const result = planGeneration({
      workload: "campaign_art", wantsReference: false, hasReferenceBytes: false,
    });
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.equal(result.refusal.stage, "storage");
  });
});

test("a refusal never leaks a variable, bucket or provider name", () => {
  withEnv({}, () => {
    const result = planGeneration({ workload: "campaign_art", wantsReference: false, hasReferenceBytes: false });
    assert.ok(!result.ok);
    assert.doesNotMatch(result.refusal.merchantMessage, /ASSET_|AWS_|S3|bucket|OPENAI|GOOGLE|gemini|gpt-/i);
    // The detail an operator needs is kept, separately.
    assert.match(result.refusal.operatorDetail, /ASSET_BUCKET/);
  });
});

test("product-faithful work is refused rather than invented when no capable model is on", () => {
  // The worst outcome this system can produce is a convincing picture of a
  // product the merchant does not sell, presented as theirs.
  withEnv({ ...STORAGE, ANTHROPIC_API_KEY: "k" }, () => {
    const result = planGeneration({
      workload: "product_reference_edit", wantsReference: true, hasReferenceBytes: true,
    });
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.equal(result.refusal.stage, "model");
    assert.match(result.refusal.merchantMessage, /work from your product photo/);
  });
});

test("a product with no photo cannot be kept faithful, and says so", () => {
  withEnv({ ...STORAGE, GOOGLE_API_KEY: "k", JOON_NANO_BANANA_ENABLED: "true" }, () => {
    const result = planGeneration({
      workload: "product_reference_edit", wantsReference: true, hasReferenceBytes: false,
    });
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.equal(result.refusal.stage, "reference");
    assert.match(result.refusal.merchantMessage, /no image in your store/);
    assert.match(result.refusal.merchantMessage, /illustrative concept instead/);
  });
});

test("with storage and a reference-capable model, the plan is reference-grounded", () => {
  withEnv({ ...STORAGE, GOOGLE_API_KEY: "k", JOON_NANO_BANANA_ENABLED: "true" }, () => {
    const result = planGeneration({
      workload: "product_reference_edit", wantsReference: true, hasReferenceBytes: true,
    });
    assert.ok(result.ok);
    assert.equal(result.plan.referenceGrounded, true);
    assert.ok(result.plan.model.capabilities.includes("image_reference_input"));
    assert.equal(result.plan.model.apiModelId, "gemini-3.1-flash-image");
  });
});

test("not asking for a reference does not force one", () => {
  withEnv({ ...STORAGE, OPENAI_API_KEY: "k", JOON_OPENAI_IMAGE_ENABLED: "true" }, () => {
    const result = planGeneration({
      workload: "campaign_art", wantsReference: false, hasReferenceBytes: false,
    });
    assert.ok(result.ok);
    assert.equal(result.plan.referenceGrounded, false);
  });
});

test("an unknown preferred model is refused, not quietly swapped", () => {
  withEnv({ ...STORAGE, OPENAI_API_KEY: "k", JOON_OPENAI_IMAGE_ENABLED: "true" }, () => {
    const result = planGeneration({
      workload: "campaign_art", preferredModelId: "made-up-model",
      wantsReference: false, hasReferenceBytes: false,
    });
    assert.equal(result.ok, false);
  });
});

test("adapter failures become merchant-safe messages", () => {
  const refusal = refusalFromAdapterError(
    new VisualAdapterError(
      "This workspace's image model is not enabled on the connected account.",
      "openai gpt-image-2.5-flare: organization must be verified",
      "not_permitted",
    ),
  );
  assert.match(refusal.merchantMessage, /not enabled on the connected account/);
  assert.doesNotMatch(refusal.merchantMessage, /openai|gpt-image|organization/i);
  assert.match(refusal.operatorDetail, /organization must be verified/);
});

test("an unexpected error still produces a plain sentence", () => {
  const refusal = refusalFromAdapterError(new Error("ECONNRESET socket hang up"));
  assert.match(refusal.merchantMessage, /Your email is unchanged/);
  assert.doesNotMatch(refusal.merchantMessage, /ECONNRESET/);
});
