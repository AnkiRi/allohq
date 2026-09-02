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
