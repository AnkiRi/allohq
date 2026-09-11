import assert from "node:assert/strict";
import test from "node:test";
import { LANDING_EVENT_MAX_BYTES, isSameOriginBrowserRequest, landingEventAllowed, parseLandingEventBody, readBoundedBody, requestIp } from "./landing-event-guard";

test("landing event limiter rejects the thirty-first request in a minute", () => {
  const now = 1_000;
  for (let index = 0; index < 30; index += 1) assert.equal(landingEventAllowed("203.0.113.8", now), true);
  assert.equal(landingEventAllowed("203.0.113.8", now), false);
  assert.equal(landingEventAllowed("203.0.113.8", now + 60_001), true);
});

test("landing event guard rejects oversized, malformed and non-enumerated payloads", () => {
  assert.equal(parseLandingEventBody("x".repeat(LANDING_EVENT_MAX_BYTES + 1)), null);
  assert.equal(parseLandingEventBody("{broken"), null);
  assert.equal(parseLandingEventBody(JSON.stringify({ event: "landing_view", email: "customer@example.com" })), null);
  assert.deepEqual(parseLandingEventBody(JSON.stringify({ event: "landing_view" })), { event: "landing_view" });
});

test("landing event guard stops reading an undeclared oversized body", async () => {
  const request = new Request("https://joonhq.com/api/public/landing-events", {
    method: "POST",
    body: "x".repeat(LANDING_EVENT_MAX_BYTES + 1),
  });
  assert.equal(await readBoundedBody(request), null);
});

test("landing analytics requires same-origin browser metadata", () => {
  const url = "https://joonhq.com/api/public/landing-events";
  assert.equal(isSameOriginBrowserRequest(new Request(url, { headers: { "sec-fetch-site": "same-origin" } })), true);
  assert.equal(isSameOriginBrowserRequest(new Request(url, { headers: { origin: "https://joonhq.com" } })), true);
  assert.equal(isSameOriginBrowserRequest(new Request(url, { headers: { origin: "https://attacker.example" } })), false);
  assert.equal(isSameOriginBrowserRequest(new Request(url)), false);
});

test("landing event guard uses only the first forwarding hop and keeps bodies small", () => {
  assert.equal(requestIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
  assert.equal(LANDING_EVENT_MAX_BYTES, 2_048);
});
