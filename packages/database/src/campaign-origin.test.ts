import assert from "node:assert/strict";
import test from "node:test";
import { parseCampaignOrigin } from "./campaign-origin";

test("campaign origin accepts only explicit merchant and joon values", () => {
  assert.equal(parseCampaignOrigin("merchant"), "merchant");
  assert.equal(parseCampaignOrigin("joon"), "joon");
  assert.throws(() => parseCampaignOrigin("agent"));
  assert.throws(() => parseCampaignOrigin(null));
});
