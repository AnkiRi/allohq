import test from "node:test";
import assert from "node:assert/strict";
import { sessionDecision } from "./session-decision";

/**
 * Who reaches the dashboard, and who is sent to sign in.
 *
 * The dashboard path roots are exempt from Clerk's middleware so an embedded
 * Shopify install works in browsers that block third-party cookies. The side
 * effect was that a signed-out person opening `/dashboard` got the shell —
 * menus, a connect-store form, an inert sign-out button, every panel empty
 * because each API call was refused. Nothing was exposed; it simply read as a
 * broken product rather than a closed door.
 */

test("a signed-out visitor is sent to sign in", () => {
  assert.equal(
    sessionDecision({ isLoaded: true, isSignedIn: false, embedded: false }),
    "redirect"
  );
});

test("a signed-in visitor gets the app", () => {
  assert.equal(sessionDecision({ isLoaded: true, isSignedIn: true, embedded: false }), "render");
});

test("nothing happens until Clerk has settled", () => {
  // Redirecting on an unsettled state would throw people out of their own
  // session on every cold load.
  assert.equal(sessionDecision({ isLoaded: false, isSignedIn: false, embedded: false }), "wait");
  assert.equal(sessionDecision({ isLoaded: false, isSignedIn: true, embedded: false }), "wait");
});

test("an embedded Shopify session renders whatever Clerk says", () => {
  // Its credential is an App Bridge token, not a Clerk cookie. Redirecting here
  // would break the install the middleware exemption exists to protect — which
  // is the whole reason this check is a component and not middleware.
  for (const isLoaded of [true, false]) {
    for (const isSignedIn of [true, false]) {
      assert.equal(
        sessionDecision({ isLoaded, isSignedIn, embedded: true }),
        "render",
        `embedded must render (isLoaded=${isLoaded}, isSignedIn=${isSignedIn})`
      );
    }
  }
});
