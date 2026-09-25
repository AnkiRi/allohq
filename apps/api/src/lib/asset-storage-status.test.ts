import test from "node:test";
import assert from "node:assert/strict";
import { assetStorageStatus } from "./asset-storage-status";

const KEYS = ["ASSET_BUCKET", "ASSET_CDN_BASE_URL", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
  "ASSET_AWS_ACCESS_KEY_ID", "ASSET_AWS_SECRET_ACCESS_KEY"];
function withEnv<T>(env: Record<string, string | undefined>, run: () => T): T {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const k of KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(env)) if (v) process.env[k] = v;
    return run();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
  }
}
const ALL = {
  ASSET_BUCKET: "joon-assets",
  ASSET_CDN_BASE_URL: "https://cdn.example",
  AWS_ACCESS_KEY_ID: "AKIA",
  AWS_SECRET_ACCESS_KEY: "secret",
};

test("fully configured storage is available", () => {
  withEnv(ALL, () => {
    const status = assetStorageStatus();
    assert.equal(status.configured, true);
    assert.deepEqual(status.missing, []);
    assert.equal(status.merchantMessage, null);
  });
});

test("credentials count, not only the bucket and CDN URL", () => {
  // The production error named only ASSET_BUCKET and ASSET_CDN_BASE_URL, so an
  // operator could set both and still have every upload fail.
  withEnv({ ASSET_BUCKET: "b", ASSET_CDN_BASE_URL: "https://cdn" }, () => {
    const status = assetStorageStatus();
    assert.equal(status.configured, false);
    assert.ok(status.missing.some((m) => m.includes("AWS_ACCESS_KEY_ID")));
  });
});

test("storage's own key is enough; it need not share the AWS key SES would use", () => {
  withEnv({ ASSET_BUCKET: "b", ASSET_CDN_BASE_URL: "https://cdn",
    ASSET_AWS_ACCESS_KEY_ID: "AKIAASSETS", ASSET_AWS_SECRET_ACCESS_KEY: "s" }, () => {
    assert.equal(assetStorageStatus().configured, true);
  });
});

test("every missing piece is listed, not just the first", () => {
  withEnv({}, () => {
    const status = assetStorageStatus();
    assert.equal(status.missing.length, 3);
    assert.ok(status.missing.includes("ASSET_BUCKET"));
    assert.ok(status.missing.includes("ASSET_CDN_BASE_URL"));
  });
});

test("the merchant message leaks no variable, bucket or provider name", () => {
  withEnv({}, () => {
    const message = assetStorageStatus().merchantMessage ?? "";
    assert.doesNotMatch(message, /ASSET_|AWS_|S3|bucket|CDN|endpoint|region/i);
    assert.doesNotMatch(message, /[A-Z_]{6,}/, "no SCREAMING_CASE identifiers");
  });
});

test("the merchant message says what happens to their work", () => {
  withEnv({}, () => {
    const message = assetStorageStatus().merchantMessage ?? "";
    assert.match(message, /not available for this workspace yet/);
    assert.match(message, /will not start work it cannot save/);
  });
});

test("partial credentials do not count as credentials", () => {
  withEnv({ ...ALL, AWS_SECRET_ACCESS_KEY: undefined }, () => {
    assert.equal(assetStorageStatus().configured, false);
  });
});
