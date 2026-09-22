import test from "node:test";
import assert from "node:assert/strict";
import {
  findTokens,
  isKnownToken,
  PERSONALIZATION_TOKENS,
  resolvePersonalization,
  tokenText,
} from "./personalization";

test("a merge tag never renders as itself", () => {
  // The old renderer emitted `{{firstname}}` straight into the inbox.
  assert.equal(resolvePersonalization("Hi {{firstname}},", {}), "Hi ,");
  assert.equal(resolvePersonalization("Hi {{city}},", {}), "Hi ,");
  assert.doesNotMatch(resolvePersonalization("{{anything}} {{at_all}}", {}), /[{}]/);
});

test("a value is used when the customer has one", () => {
  assert.equal(resolvePersonalization("Hi {{first_name}},", { first_name: "Priya" }), "Hi Priya,");
});

test("a written fallback is used when the value is missing", () => {
  assert.equal(resolvePersonalization("Hi {{first_name|friend}},", {}), "Hi friend,");
});

test("an empty value falls back rather than leaving a gap", () => {
  assert.equal(
    resolvePersonalization("Hi {{first_name|friend}},", { first_name: "" }),
    "Hi friend,",
  );
});

test("a known token falls back to its default when nothing is written", () => {
  assert.equal(resolvePersonalization("Hi {{first_name}},", {}), "Hi there,");
  assert.equal(resolvePersonalization("Made for {{segment}}.", {}), "Made for customers.");
});

test("a written fallback beats the default", () => {
  assert.equal(resolvePersonalization("Hi {{first_name|you}},", {}), "Hi you,");
});

test("whitespace inside the braces is tolerated", () => {
  assert.equal(resolvePersonalization("Hi {{ first_name }},", { first_name: "Priya" }), "Hi Priya,");
});

test("tokens are found with their fallbacks and whether Joon can fill them", () => {
  const uses = findTokens("Hi {{first_name|friend}}, your {{city}} order");
  assert.deepEqual(uses, [
    { key: "first_name", fallback: "friend", known: true },
    { key: "city", fallback: null, known: false },
  ]);
});

test("the catalogue only offers tokens the sender actually populates", () => {
  // These are the keys `send.worker.ts` builds. Offering one it does not build
  // would promise personalization that is really just a fallback for everyone.
  const populatedBySender = new Set([
    "first_name", "last_name", "email", "unsubscribe_url", "order_count",
    "segment", "ltv", "avg_order_value", "last_order_date",
    "days_since_purchase", "discount_code", "greeting", "emoji", "signoff",
  ]);
  for (const token of PERSONALIZATION_TOKENS) {
    assert.ok(populatedBySender.has(token.key), `${token.key} is offered but never populated`);
  }
});

test("every offered token has a label and a sample a merchant can read", () => {
  for (const token of PERSONALIZATION_TOKENS) {
    assert.ok(token.label.length > 0, `${token.key} needs a label`);
    assert.ok(token.sample.length > 0, `${token.key} needs a sample`);
  }
});

test("first name is safe to greet with", () => {
  // A greeting is the commonest personalization and the most visible failure.
  assert.equal(resolvePersonalization("Hi {{first_name}},", {}), "Hi there,");
  assert.ok(isKnownToken("first_name"));
});

test("inserting a token writes its fallback in, so it cannot be forgotten", () => {
  assert.equal(tokenText("first_name"), "{{first_name|there}}");
  assert.equal(tokenText("first_name", "friend"), "{{first_name|friend}}");
  // A token with no sensible default stays bare rather than inventing one.
  assert.equal(tokenText("email"), "{{email}}");
});

test("repeated tokens all resolve", () => {
  assert.equal(
    resolvePersonalization("{{first_name}} — {{first_name}}", { first_name: "Priya" }),
    "Priya — Priya",
  );
});

test("text with no tokens is returned untouched", () => {
  assert.equal(resolvePersonalization("Ride further this winter.", {}), "Ride further this winter.");
});
