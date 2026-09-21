import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error - plain ESM helper shared with the test runners
import { checkDisposableDatabaseUrl } from "./assert-disposable-database.mjs";

/**
 * The guard is an allowlist: a URL must positively look disposable. These pin
 * that a realistic production URL cannot slip through, since the cost of a
 * false negative is a wiped production database.
 */

const accepted = [
  "postgresql://user@localhost:5432/joon_test",
  "postgresql://user:pw@127.0.0.1:5432/joon_integration",
  "postgres://joon:joon@localhost:5432/ci-db",
  "postgresql://u@localhost/scratch_db",
];

const rejected: Array<[string, string]> = [
  ["postgresql://u:p@prod-db.abc123.us-east-1.rds.amazonaws.com:5432/joon_test", "managed host"],
  ["postgresql://u:p@ep-cool-name.eu-central-1.aws.neon.tech/joon_ci", "managed host"],
  ["postgresql://u@localhost:5432/allohq", "production-looking name on localhost"],
  ["postgresql://u@localhost:5432/joon", "production-looking name on localhost"],
  ["postgresql://u@db.internal:5432/joon_test", "non-local host"],
  ["not a url", "unparseable"],
  ["", "empty"],
];

test("disposable database URLs are accepted", () => {
  for (const url of accepted) {
    const result = checkDisposableDatabaseUrl(url);
    assert.equal(result.ok, true, `${url} should be accepted, got: ${result.reason}`);
  }
});

test("anything that could be real is rejected", () => {
  for (const [url, why] of rejected) {
    const result = checkDisposableDatabaseUrl(url);
    assert.equal(result.ok, false, `${url} should be rejected (${why})`);
    assert.ok(result.reason, "a rejection must explain itself");
  }
});

test("a managed host is rejected even with a disposable name and the remote opt-in", () => {
  process.env.ALLOW_NON_LOCAL_TEST_DATABASE = "1";
  try {
    const result = checkDisposableDatabaseUrl(
      "postgresql://u:p@prod.abc.us-east-1.rds.amazonaws.com:5432/joon_integration"
    );
    assert.equal(result.ok, false, "the opt-in must not unlock a managed database host");
  } finally {
    delete process.env.ALLOW_NON_LOCAL_TEST_DATABASE;
  }
});

test("the remote opt-in allows a CI service container but still requires a disposable name", () => {
  process.env.ALLOW_NON_LOCAL_TEST_DATABASE = "1";
  try {
    assert.equal(checkDisposableDatabaseUrl("postgresql://joon@postgres:5432/joon_ci").ok, true);
    assert.equal(checkDisposableDatabaseUrl("postgresql://joon@postgres:5432/allohq").ok, false);
  } finally {
    delete process.env.ALLOW_NON_LOCAL_TEST_DATABASE;
  }
});
