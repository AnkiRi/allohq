import assert from "node:assert/strict";
import test from "node:test";
import { SHOPIFY_SCOPES } from "./constants";

test("public v1 requests only its email decision-layer scopes", () => {
  assert.equal(SHOPIFY_SCOPES.includes("read_all_orders" as never), false);
  for (const forbidden of ["write_orders", "write_products", "write_customers"]) {
    assert.equal(SHOPIFY_SCOPES.includes(forbidden as never), false, `${forbidden} must remain out of v1`);
  }
  for (const required of ["read_products", "read_customers", "read_orders", "write_discounts", "write_pixels", "read_customer_events"]) {
    assert.equal(SHOPIFY_SCOPES.includes(required as never), true, `${required} supports a shipped v1 capability`);
  }
});
