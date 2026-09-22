import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createInvitationToken,
  hashInvitationToken,
  invitationTokenMatches,
  isInviteOnlyMode,
  isPlatformAdmin,
  platformAdminClerkIds,
} from "./closed-beta";

/**
 * The parts of closed beta that hold no database: the mode switch, who counts
 * as an operator, and what a token is.
 */

function withEnv<T>(values: Record<string, string | undefined>, body: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return body();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("invite-only is off unless it is explicitly on", () => {
  withEnv({ INVITE_ONLY_MODE: undefined }, () => assert.equal(isInviteOnlyMode(), false));
  withEnv({ INVITE_ONLY_MODE: "" }, () => assert.equal(isInviteOnlyMode(), false));
  // A missing or malformed value must not turn the gate ON either — a typo
  // that silently closed the app to everyone is its own outage.
  withEnv({ INVITE_ONLY_MODE: "yes" }, () => assert.equal(isInviteOnlyMode(), false));
  withEnv({ INVITE_ONLY_MODE: "1" }, () => assert.equal(isInviteOnlyMode(), false));
  withEnv({ INVITE_ONLY_MODE: "true" }, () => assert.equal(isInviteOnlyMode(), true));
  withEnv({ INVITE_ONLY_MODE: "  TRUE  " }, () => assert.equal(isInviteOnlyMode(), true));
});

test("platform admins come from the environment, never from source", () => {
  withEnv({ PLATFORM_ADMIN_CLERK_IDS: undefined }, () => {
    assert.equal(platformAdminClerkIds().size, 0);
    assert.equal(isPlatformAdmin("user_anything"), false);
  });
  withEnv({ PLATFORM_ADMIN_CLERK_IDS: " user_a , user_b ,, " }, () => {
    const ids = platformAdminClerkIds();
    assert.deepEqual([...ids].sort(), ["user_a", "user_b"]);
    assert.equal(isPlatformAdmin("user_a"), true);
    assert.equal(isPlatformAdmin("user_c"), false);
    // No identity at all is not an operator.
    assert.equal(isPlatformAdmin(null), false);
    assert.equal(isPlatformAdmin(undefined), false);
    assert.equal(isPlatformAdmin(""), false);
  });
});

test("a token is 256 bits, url-safe, and never the same twice", () => {
  const seen = new Set<string>();
  for (let index = 0; index < 500; index += 1) {
    const token = createInvitationToken();
    assert.match(token, /^[A-Za-z0-9_-]+$/, "must survive being put in a URL unescaped");
    assert.ok(token.length >= 42, `token looks too short: ${token.length}`);
    assert.equal(seen.has(token), false, "tokens must not repeat");
    seen.add(token);
  }
});

test("only the hash is ever comparable, and it is the documented one", () => {
  const token = createInvitationToken();
  const hash = hashInvitationToken(token);
  assert.equal(hash, createHash("sha256").update(token).digest("hex"));
  assert.equal(hash.length, 64);
  // The hash must not contain the token, or storing the hash would store the
  // token.
  assert.equal(hash.includes(token), false);
  assert.equal(invitationTokenMatches(token, hash), true);
  assert.equal(invitationTokenMatches(createInvitationToken(), hash), false);
});

test("a wrong-length or malformed hash is refused rather than throwing", () => {
  const token = createInvitationToken();
  // timingSafeEqual throws on a length mismatch; the caller must not.
  assert.equal(invitationTokenMatches(token, "short"), false);
  assert.equal(invitationTokenMatches(token, ""), false);
});
