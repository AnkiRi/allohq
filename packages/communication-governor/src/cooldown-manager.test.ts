import assert from "node:assert/strict";
import test from "node:test";
import { latestRedeemedOffer } from "./cooldown-manager";

test("a received discount does not start cooldown without a redemption", () => {
  const offer = { sentAt: new Date("2026-09-10T10:00:00Z"), discountCode: "SAVE15" };
  assert.equal(latestRedeemedOffer([offer], []), undefined);
  assert.equal(
    latestRedeemedOffer([offer], [
      { createdAt: new Date("2026-09-11T10:00:00Z"), discountCodes: ["OTHER"] },
    ]),
    undefined
  );
});

test("a matching non-cancelled order after the email identifies redemption", () => {
  const older = { sentAt: new Date("2026-09-08T10:00:00Z"), discountCode: "OLD10" };
  const latest = { sentAt: new Date("2026-09-10T10:00:00Z"), discountCode: "save15" };
  assert.equal(
    latestRedeemedOffer([latest, older], [
      { createdAt: new Date("2026-09-11T10:00:00Z"), discountCodes: [" SAVE15 "] },
    ]),
    latest
  );
});

test("an order before the email cannot redeem that email's offer", () => {
  const offer = { sentAt: new Date("2026-09-10T10:00:00Z"), discountCode: "SAVE15" };
  assert.equal(
    latestRedeemedOffer([offer], [
      { createdAt: new Date("2026-09-09T10:00:00Z"), discountCodes: ["SAVE15"] },
    ]),
    undefined
  );
});
