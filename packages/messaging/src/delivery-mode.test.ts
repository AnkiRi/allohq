import assert from "node:assert/strict";
import test from "node:test";
import { getDeliveryModeDecision, getMessagingSendMode } from "./delivery-mode";

test("delivery is disabled unless a mode is explicitly configured", () => {
  assert.equal(getMessagingSendMode(undefined), "disabled");
  assert.deepEqual(
    getDeliveryModeDecision("ankita@example.com", "email", { mode: "disabled" }),
    {
      allowed: false,
      mode: "disabled",
      reason: "delivery_disabled",
    },
  );
});

test("allowlist mode normalizes email and phone recipients", () => {
  assert.equal(
    getDeliveryModeDecision("Ankita@Example.com", "email", {
      mode: "allowlist",
      allowlist: "ankita@example.com,+919876543210",
    }).allowed,
    true,
  );
  assert.equal(
    getDeliveryModeDecision("+91 98765 43210", "whatsapp", {
      mode: "allowlist",
      allowlist: "ankita@example.com,+919876543210",
    }).allowed,
    true,
  );
});

test("allowlist mode blocks every recipient not named explicitly", () => {
  assert.deepEqual(
    getDeliveryModeDecision("customer@example.com", "email", {
      mode: "allowlist",
      allowlist: "tester@example.com",
    }),
    {
      allowed: false,
      mode: "allowlist",
      reason: "recipient_not_allowlisted",
    },
  );
});

test("live mode permits delivery", () => {
  assert.equal(
    getDeliveryModeDecision("customer@example.com", "email", {
      mode: "live",
    }).allowed,
    true,
  );
});

test("global email kill switch overrides live mode", () => {
  assert.deepEqual(
    getDeliveryModeDecision("customer@example.com", "email", {
      mode: "live",
      killSwitch: "true",
    }),
    { allowed: false, mode: "live", reason: "global_kill_switch" },
  );
});

test("the v1 release boundary blocks non-email channels at the provider", async () => {
  // Proves the excluded channels cannot reach a provider even with delivery
  // fully enabled and the recipient allowlisted.
  const prevMode = process.env["MESSAGING_SEND_MODE"];
  const prevV1 = process.env["V1_RELEASE_MODE"];
  process.env["MESSAGING_SEND_MODE"] = "live";
  delete process.env["V1_RELEASE_MODE"]; // unset must still fail closed
  try {
    const { sendViaProvider } = await import("./provider");
    for (const channel of ["sms", "whatsapp", "rcs"] as const) {
      const result = await sendViaProvider(channel, {
        to: "+919000000000",
        body: "test",
        channel,
      } as never);
      assert.equal(result.status, "failed", `${channel} must not send`);
      assert.match(String(result.error), /v1 release boundary/);
    }
  } finally {
    if (prevMode === undefined) delete process.env["MESSAGING_SEND_MODE"];
    else process.env["MESSAGING_SEND_MODE"] = prevMode;
    if (prevV1 !== undefined) process.env["V1_RELEASE_MODE"] = prevV1;
  }
});
