import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  __setStorageClientForTests,
  createEmailAssetUpload,
  EmailAssetRejectedError,
  publishUploadedEmailAsset,
  stagingPrefix,
} from "./email-asset-storage";

/**
 * Browser uploads: staged privately, published as a new sanitised object.
 *
 * Against a stateful S3 double, so every branch — including the failures —
 * can be driven deterministically. The same flow runs against a real S3 server
 * and a real browser in `email-asset-storage.s3.integration.ts`.
 */

const ENV = { ASSET_BUCKET: "joon-test", ASSET_CDN_BASE_URL: "https://assets.test", ASSET_REGION: "eu-north-1",
  AWS_ACCESS_KEY_ID: "AKIAEXAMPLE", AWS_SECRET_ACCESS_KEY: "example" };
const TENANT = { workspaceId: "ws_1", storeId: "st_1" };

async function withEnv<T>(run: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
  Object.assign(process.env, ENV);
  try {
    return await run();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

type Stored = { body: Buffer; contentType?: string; cacheControl?: string };
function bucket(options: { failPublishOnce?: boolean; failDelete?: boolean } = {}) {
  const objects = new Map<string, Stored>();
  const deletes: string[] = [];
  let failPublish = options.failPublishOnce ?? false;
  const missing = () => Object.assign(new Error("Forbidden"), { name: "Forbidden", $metadata: { httpStatusCode: 403 } });
  __setStorageClientForTests({
    send: async (command: any) => {
      const kind = command.constructor.name as string;
      const { Key, Body, ContentType, CacheControl } = command.input;
      if (kind === "PutObjectCommand") {
        if (failPublish && !Key.startsWith("staging/")) {
          failPublish = false;
          throw Object.assign(new Error("InternalError"), { name: "InternalError", $metadata: { httpStatusCode: 500 } });
        }
        objects.set(Key, { body: Buffer.from(Body), contentType: ContentType, cacheControl: CacheControl });
        return {};
      }
      if (kind === "HeadObjectCommand") {
        const object = objects.get(Key);
        if (!object) throw missing();
        return { ContentLength: object.body.byteLength, ContentType: object.contentType };
      }
      if (kind === "GetObjectCommand") {
        const object = objects.get(Key);
        if (!object) throw missing();
        return { Body: { transformToByteArray: async () => new Uint8Array(object.body) }, ContentType: object.contentType };
      }
      if (kind === "DeleteObjectCommand") {
        deletes.push(Key);
        if (options.failDelete) throw Object.assign(new Error("SlowDown"), { name: "SlowDown" });
        objects.delete(Key);
        return {};
      }
      throw new Error(`unexpected ${kind}`);
    },
  });
  /** What a browser's presigned PUT would leave behind. */
  const stage = (key: string, body: Buffer, contentType = "image/jpeg") => objects.set(key, { body, contentType });
  const published = () => [...objects.keys()].filter((key) => !key.startsWith("staging/"));
  return { objects, deletes, stage, published, restore: () => __setStorageClientForTests(null) };
}

const photo = () =>
  sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 9, g: 120, b: 200 } } })
    .withExif({ IFD0: { Copyright: "Priya at home", Model: "Phone X" } } as never)
    .jpeg()
    .toBuffer();
const stagedKey = (name = "upload-1") => `${stagingPrefix(TENANT)}${name}`;

test("an upload URL targets private staging, returns no public URL, and signs no empty-body checksum", async () => {
  const result = await withEnv(() =>
    createEmailAssetUpload({ ...TENANT, fileName: "shot.jpg", mimeType: "image/jpeg", size: 1000 }));
  assert.ok(result.key.startsWith("staging/workspaces/ws_1/stores/st_1/"), result.key);
  assert.equal("publicUrl" in result, false, "nothing is servable until it is published");
  const url = new URL(result.uploadUrl);
  assert.equal(url.searchParams.get("x-amz-checksum-crc32"), null, "no CRC32 of an empty body for the browser to contradict");
  assert.equal(url.searchParams.get("x-amz-sdk-checksum-algorithm"), null);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "600");
});

test("publishing writes clean bytes to a new content-addressed key and removes the staging object", async () => {
  const s3 = bucket();
  try {
    const raw = await photo();
    s3.stage(stagedKey(), raw);
    const result = await withEnv(() => publishUploadedEmailAsset({ ...TENANT, key: stagedKey() }));

    assert.match(result.key, /^workspaces\/ws_1\/stores\/st_1\/email-assets\/[0-9a-f]{64}\.jpg$/);
    assert.equal(result.url, `https://assets.test/${result.key}`, "the URL is for the published key only");
    const stored = s3.objects.get(result.key)!;
    assert.equal(stored.contentType, "image/jpeg");
    assert.equal(stored.cacheControl, "public,max-age=31536000,immutable");
    assert.equal((await sharp(stored.body).metadata()).exif, undefined, "no EXIF is published");
    assert.doesNotMatch(stored.body.toString("latin1"), /Priya at home|Phone X/);
    assert.equal(result.checksum, createHash("sha256").update(stored.body).digest("hex"));
    assert.equal(s3.objects.has(stagedKey()), false, "the raw staging copy is gone");
  } finally {
    s3.restore();
  }
});

test("the type is taken from the bytes, not from what the browser declared", async () => {
  const s3 = bucket();
  try {
    s3.stage(stagedKey(), await photo(), "image/png");
    const result = await withEnv(() => publishUploadedEmailAsset({ ...TENANT, key: stagedKey() }));
    assert.equal(result.mimeType, "image/jpeg");
    assert.match(result.key, /\.jpg$/);
  } finally {
    s3.restore();
  }
});

test("the same image published twice lands on the same key: published objects are never replaced", async () => {
  const s3 = bucket();
  try {
    const raw = await photo();
    s3.stage(stagedKey("a"), raw);
    s3.stage(stagedKey("b"), raw);
    const first = await withEnv(() => publishUploadedEmailAsset({ ...TENANT, key: stagedKey("a") }));
    const second = await withEnv(() => publishUploadedEmailAsset({ ...TENANT, key: stagedKey("b") }));
    assert.equal(first.key, second.key);
    assert.deepEqual(s3.published(), [first.key]);
  } finally {
    s3.restore();
  }
});

for (const [label, body, contentType] of [
  ["a PDF", Buffer.from("%PDF-1.4 not an image"), "image/png"],
  ["an SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "image/png"],
  ["a truncated JPEG", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), "image/jpeg"],
] as const) {
  test(`${label} is refused, its staging copy removed, and nothing is published`, async () => {
    const s3 = bucket();
    try {
      s3.stage(stagedKey(), Buffer.from(body), contentType);
      await withEnv(() =>
        assert.rejects(publishUploadedEmailAsset({ ...TENANT, key: stagedKey() }), EmailAssetRejectedError));
      assert.deepEqual(s3.published(), []);
      assert.equal(s3.objects.has(stagedKey()), false);
    } finally {
      s3.restore();
    }
  });
}

test("an oversized upload is refused and its staging copy removed", async () => {
  const s3 = bucket();
  try {
    s3.stage(stagedKey(), Buffer.alloc(12 * 1024 * 1024 + 1));
    await withEnv(() =>
      assert.rejects(publishUploadedEmailAsset({ ...TENANT, key: stagedKey() }), /between 1 byte and 12 MB/));
    assert.deepEqual(s3.published(), []);
    assert.equal(s3.objects.has(stagedKey()), false);
  } finally {
    s3.restore();
  }
});

test("an interrupted upload leaves nothing to publish and says so", async () => {
  // A single PUT is atomic: a browser that drops mid-upload creates no object.
  const s3 = bucket();
  try {
    await withEnv(() =>
      assert.rejects(publishUploadedEmailAsset({ ...TENANT, key: stagedKey() }), /did not arrive/));
    assert.deepEqual(s3.published(), []);
  } finally {
    s3.restore();
  }
});

test("another tenant's staging key, a published key or a nested path is refused without touching it", async () => {
  const s3 = bucket();
  try {
    const foreign = `${stagingPrefix({ workspaceId: "ws_2", storeId: "st_9" })}upload-1`;
    s3.stage(foreign, await photo());
    for (const key of [foreign, "workspaces/ws_1/stores/st_1/email-assets/abc.jpg", `${stagingPrefix(TENANT)}x/../../y`]) {
      await withEnv(() =>
        assert.rejects(publishUploadedEmailAsset({ ...TENANT, key }), /does not belong to this store/));
    }
    assert.ok(s3.objects.has(foreign), "the other tenant's upload is untouched");
    assert.deepEqual(s3.deletes, []);
  } finally {
    s3.restore();
  }
});

test("a failed publish keeps the staging object, and retrying the same completion succeeds", async () => {
  const s3 = bucket({ failPublishOnce: true });
  try {
    s3.stage(stagedKey(), await photo());
    await withEnv(() =>
      assert.rejects(publishUploadedEmailAsset({ ...TENANT, key: stagedKey() }), (error: Error) =>
        !(error instanceof EmailAssetRejectedError)));
    assert.ok(s3.objects.has(stagedKey()), "nothing was lost");
    assert.deepEqual(s3.published(), []);
    const retried = await withEnv(() => publishUploadedEmailAsset({ ...TENANT, key: stagedKey() }));
    assert.deepEqual(s3.published(), [retried.key]);
  } finally {
    s3.restore();
  }
});

test("a failed staging cleanup does not fail a published upload", async () => {
  const s3 = bucket({ failDelete: true });
  try {
    s3.stage(stagedKey(), await photo());
    const result = await withEnv(() => publishUploadedEmailAsset({ ...TENANT, key: stagedKey() }));
    assert.deepEqual(s3.published(), [result.key]);
    assert.ok(s3.objects.has(stagedKey()), "left for the staging lifecycle rule");
  } finally {
    s3.restore();
  }
});
