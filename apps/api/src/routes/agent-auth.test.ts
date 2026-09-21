import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";
import { authenticateAgentRequest } from "./agent-auth";

/**
 * Resolving the caller of the merchant-agent endpoint.
 *
 * Its own module so this can be proved without loading the agent runtime.
 */

function fakeRequest(options: { authorization?: string } = {}): IncomingMessage {
  const stream = new PassThrough();
  stream.end("");
  const request = stream as unknown as IncomingMessage;
  request.method = "POST";
  request.headers = options.authorization ? { authorization: options.authorization } : {};
  return request;
}

test("a request with no credentials does not resolve to a caller", async () => {
  const caller = await authenticateAgentRequest(fakeRequest());
  assert.ok("error" in caller);
  assert.equal("error" in caller && caller.status, 401);
});

test("a malformed Authorization header does not resolve to a caller", async () => {
  for (const authorization of ["Bearer", "Bearer ", "Token abc", "abc", ""]) {
    const caller = await authenticateAgentRequest(fakeRequest({ authorization }));
    assert.ok("error" in caller, `"${authorization}" must not authenticate`);
    assert.equal("error" in caller && caller.status, 401);
  }
});

test("a well-formed token is refused when the server has no Clerk secret", async () => {
  const previous = process.env["CLERK_SECRET_KEY"];
  delete process.env["CLERK_SECRET_KEY"];
  try {
    const caller = await authenticateAgentRequest(
      fakeRequest({ authorization: "Bearer looks.like.a.token" })
    );
    // An unconfigured deployment fails closed rather than reaching out to
    // verify, which would also let an unauthenticated request cost a network
    // round trip.
    assert.ok("error" in caller);
    assert.equal("error" in caller && caller.status, 401);
  } finally {
    if (previous !== undefined) process.env["CLERK_SECRET_KEY"] = previous;
  }
});

test("a token that is not a valid session is refused", async () => {
  const previous = process.env["CLERK_SECRET_KEY"];
  process.env["CLERK_SECRET_KEY"] = "sk_test_not_a_real_key";
  try {
    const caller = await authenticateAgentRequest(
      fakeRequest({ authorization: "Bearer not-a-jwt" })
    );
    assert.ok("error" in caller);
    assert.equal("error" in caller && caller.status, 401);
  } finally {
    if (previous === undefined) delete process.env["CLERK_SECRET_KEY"];
    else process.env["CLERK_SECRET_KEY"] = previous;
  }
});
