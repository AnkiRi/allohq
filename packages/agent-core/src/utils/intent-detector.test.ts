import assert from "node:assert/strict";
import test from "node:test";
import { extractMerchantRequestConstraints } from "./intent-detector";

test("preserves top-customer count and discount from a campaign request", () => {
  assert.deepEqual(
    extractMerchantRequestConstraints("Create a 30% discount campaign for top 30 customers"),
    {
      topCustomerCount: 30,
      discountPercent: 30,
      noDiscount: undefined,
      noControl: undefined,
      deliveryIntent: undefined,
    }
  );
});

test("does not mistake an unrelated percentage for a discount", () => {
  assert.deepEqual(
    extractMerchantRequestConstraints("Email the top 12 customers whose revenue grew 20%"),
    {
      topCustomerCount: 12,
      discountPercent: undefined,
      noDiscount: undefined,
      noControl: undefined,
      deliveryIntent: undefined,
    }
  );
});

test("preserves no-offer, no-control and immediate-delivery instructions", () => {
  assert.deepEqual(
    extractMerchantRequestConstraints("Send a full-price email now without a control"),
    {
      topCustomerCount: undefined,
      discountPercent: undefined,
      noDiscount: true,
      noControl: true,
      deliveryIntent: "immediate",
    }
  );
});
