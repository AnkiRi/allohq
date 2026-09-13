import assert from "node:assert/strict";
import test from "node:test";
import { isWebhookOlderThanInstall } from "./shopify-webhook-ordering";

test("an uninstall triggered before a reinstall cannot deactivate the new installation", () => {
  const installedAt = new Date("2026-09-13T14:00:00.000Z");
  assert.equal(isWebhookOlderThanInstall("2026-09-13T13:59:59.000Z", installedAt), true);
  assert.equal(isWebhookOlderThanInstall("2026-09-13T14:00:01.000Z", installedAt), false);
  assert.equal(isWebhookOlderThanInstall(null, installedAt), false);
});
