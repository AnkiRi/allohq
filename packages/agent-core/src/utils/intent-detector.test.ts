import assert from "node:assert/strict";
import test from "node:test";
import { extractMerchantRequestConstraints } from "./intent-detector";

test("preserves top-customer count and discount from a campaign request", () => {
  assert.deepEqual(
    extractMerchantRequestConstraints("Create a 30% discount campaign for top 30 customers"),
    {
      topCustomerCount: 30,
      discountPercent: 30,
      discountDurationHours: undefined,
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
      discountDurationHours: undefined,
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
      discountDurationHours: undefined,
      noDiscount: true,
      noControl: true,
      deliveryIntent: "immediate",
    }
  );
});

test("preserves a requested 24-hour discount validity window", () => {
  const constraints = extractMerchantRequestConstraints(
    "Make a 25% discount campaign for my top 25 customers - discount must be valid only for 24 hours"
  );
  assert.equal(constraints.topCustomerCount, 25);
  assert.equal(constraints.discountPercent, 25);
  assert.equal(constraints.discountDurationHours, 24);
});

test("does not apply an unrelated time window to a discount", () => {
  const constraints = extractMerchantRequestConstraints("Show the last 24 hours of discount performance");
  assert.equal(constraints.discountDurationHours, undefined);
});

test("retains an unsupported requested duration so campaign creation can reject it", () => {
  const constraints = extractMerchantRequestConstraints("Make a 25% discount valid for 40 days");
  assert.equal(constraints.discountDurationHours, 960);
});

test("treats without any discount as a hard full-price constraint", () => {
  const constraints = extractMerchantRequestConstraints(
    "Create a campaign for uast23@gmail.com without any discount, featuring new products."
  );
  assert.equal(constraints.noDiscount, true);
  assert.equal(constraints.discountPercent, undefined);
});
