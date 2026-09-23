import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageGenerationUnavailableError } from "./generate-image";

/**
 * Image generation failed in production for every request, with:
 *
 *   [Image/DALL-E] Error: 400 The model 'dall-e-3' does not exist.
 *
 * The model was hardcoded, and this account's key has no access to it. These
 * pin the two things that made that failure worse than it needed to be: no
 * second model to fall back to, and a merchant-facing message full of
 * internals.
 */

test("the merchant-facing failure names no provider, model, purpose or prompt", () => {
  const error = new ImageGenerationUnavailableError();
  assert.doesNotMatch(error.message, /dall-?e|gpt-image|openai|replicate|flux|unsplash/i);
  assert.doesNotMatch(error.message, /purpose|prompt|provider/i);
  assert.doesNotMatch(error.message, /\[Image\]/);
});

test("it tells the merchant what happened to their email instead", () => {
  const error = new ImageGenerationUnavailableError();
  assert.match(error.message, /Your email is unchanged/);
  assert.match(error.message, /try again, or add an image yourself/i);
});

const providerSource = readFileSync(
  join(__dirname, "providers", "openai-images.ts"),
  "utf8",
);

test("the image provider tries more than one model", () => {
  // A 400 naming a model is a capability answer, not a transient fault, so a
  // single hardcoded model means one account setting disables the feature
  // entirely — which is exactly what happened.
  assert.match(providerSource, /const MODELS = \["gpt-image-1", "dall-e-3"\]/);
  assert.match(providerSource, /does not exist\|do not have access/, "unavailability is detected, not swallowed");
});

test("base64 output is normalised so persistence does not care which model ran", () => {
  assert.match(providerSource, /data:image\/png;base64,/, "gpt-image-1 returns b64, not a URL");
});
