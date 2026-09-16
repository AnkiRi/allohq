import assert from "node:assert/strict";
import test from "node:test";
import { learnProductRelationships } from "./product-graph";

test("learns directional next-purchase, same-basket and replenishment evidence", () => {
  const day = (n: number) => new Date(`2026-01-${String(n).padStart(2, "0")}T00:00:00Z`);
  const rows = learnProductRelationships([
    {
      customerId: "a",
      createdAt: day(1),
      items: [{ productId: "protein" }, { productId: "shaker" }],
    },
    { customerId: "a", createdAt: day(8), items: [{ productId: "creatine" }] },
    { customerId: "a", createdAt: day(15), items: [{ productId: "protein" }] },
    {
      customerId: "b",
      createdAt: day(2),
      items: [{ productId: "protein" }, { productId: "shaker" }],
    },
    { customerId: "b", createdAt: day(9), items: [{ productId: "creatine" }] },
    { customerId: "b", createdAt: day(16), items: [{ productId: "protein" }] },
  ]);
  assert(
    rows.some(
      (row) =>
        row.relationshipType === "bundle" &&
        row.sourceProductId === "protein" &&
        row.targetProductId === "shaker"
    )
  );
  assert(
    rows.some(
      (row) =>
        row.relationshipType === "cross_sell" &&
        row.sourceProductId === "protein" &&
        row.targetProductId === "creatine" &&
        row.medianLagDays === 7
    )
  );
  assert(
    rows.some(
      (row) =>
        row.relationshipType === "replenishment" &&
        row.sourceProductId === "protein" &&
        row.targetProductId === "protein"
    )
  );
});
