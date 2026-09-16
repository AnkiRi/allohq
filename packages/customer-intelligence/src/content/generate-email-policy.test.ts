import assert from "node:assert/strict";
import test from "node:test";
import { shouldGenerateCampaignArtwork } from "./generate-email";

test("full-price email never generates opaque campaign artwork", () => {
  assert.equal(
    shouldGenerateCampaignArtwork({ creativeIntensity: "visual_heavy", offerPolicy: "full_price" }),
    false,
  );
});

test("discount and neutral campaigns retain configured visual generation", () => {
  assert.equal(
    shouldGenerateCampaignArtwork({ creativeIntensity: "balanced", offerPolicy: "discount" }),
    true,
  );
  assert.equal(
    shouldGenerateCampaignArtwork({ creativeIntensity: "text_heavy", offerPolicy: "none" }),
    false,
  );
});
