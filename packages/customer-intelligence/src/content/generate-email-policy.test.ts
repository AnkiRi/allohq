import assert from "node:assert/strict";
import test from "node:test";
import { shouldGenerateCampaignArtwork } from "./generate-email";

test("full-price email never generates opaque campaign artwork", () => {
  assert.equal(
    shouldGenerateCampaignArtwork({ creativeIntensity: "visual_heavy", offerPolicy: "full_price" }),
    false,
  );
});

test("automatic artwork requires a workspace budget and a durable publisher", () => {
  assert.equal(
    shouldGenerateCampaignArtwork({ creativeIntensity: "balanced", offerPolicy: "discount" }),
    false,
  );
  assert.equal(
    shouldGenerateCampaignArtwork({ creativeIntensity: "balanced", offerPolicy: "discount", workspaceId: "workspace" }),
    false,
  );
  assert.equal(
    shouldGenerateCampaignArtwork({
      creativeIntensity: "balanced",
      offerPolicy: "discount",
      workspaceId: "workspace",
      publishGeneratedImage: async () => "https://assets.example.test/image.png",
    }),
    true,
  );
  assert.equal(
    shouldGenerateCampaignArtwork({ creativeIntensity: "text_heavy", offerPolicy: "none" }),
    false,
  );
});
