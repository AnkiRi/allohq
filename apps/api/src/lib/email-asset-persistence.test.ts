import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  __setStorageClientForTests,
  emailAssetKey,
  persistRemoteEmailImage,
} from "./email-asset-storage";

/**
 * Persistence against an S3 double.
 *
 * Two things are worth proving without a real bucket: that the tenant prefix
 * in the object key really isolates workspaces, and that what gets STORED is
 * the stripped, re-encoded image rather than the bytes a provider handed back.
 */

const ENV = {
  ASSET_BUCKET: "joon-test", ASSET_CDN_BASE_URL: "https://cdn.test",
  AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "s",
};
function withEnv<T>(run: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
  Object.assign(process.env, ENV);
  return run().finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

type Put = { Bucket: string; Key: string; Body: Buffer; ContentType: string; Metadata: Record<string, string> };
function s3Double() {
  const puts: Put[] = [];
  __setStorageClientForTests({
    send: async (command: any) => {
      if (command?.input?.Body) puts.push(command.input as Put);
      return {};
    },
  });
  return { puts, restore: () => __setStorageClientForTests(null) };
}

async function plainPng(): Promise<string> {
  const png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } },
  }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function photoWithExif(): Promise<string> {
  const jpeg = await sharp({
    create: { width: 32, height: 24, channels: 3, background: { r: 9, g: 120, b: 200 } },
  })
    .withExif({ IFD0: { Copyright: "Studio Tester", Model: "Camera X" } } as never)
    .jpeg()
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

test("the object key carries the tenant, which is the isolation boundary", () => {
  const a = emailAssetKey({ workspaceId: "ws_a", storeId: "st_1", checksum: "abc", extension: "png" });
  const b = emailAssetKey({ workspaceId: "ws_b", storeId: "st_1", checksum: "abc", extension: "png" });
  assert.match(a, /^workspaces\/ws_a\/stores\/st_1\/email-assets\/abc\.png$/);
  assert.notEqual(a, b, "identical bytes in two workspaces never share a key");
});

test("a generated image is stored under its own workspace and store", async () => {
  const s3 = s3Double();
  try {
    const dataUrl = await plainPng();
    const result = await withEnv(() =>
      persistRemoteEmailImage({
        workspaceId: "ws_1", storeId: "store_1", remoteUrl: dataUrl, fileName: "hero.png",
      }),
    );
    assert.equal(s3.puts.length, 1);
    assert.equal(s3.puts[0]!.Bucket, "joon-test");
    assert.match(s3.puts[0]!.Key, /^workspaces\/ws_1\/stores\/store_1\/email-assets\//);
    assert.equal(s3.puts[0]!.Metadata["workspace"], "ws_1");
    assert.match(result.url, /^https:\/\/cdn\.test\/workspaces\/ws_1\//);
  } finally {
    s3.restore();
  }
});

test("what is STORED has no metadata, whatever the provider returned", async () => {
  const s3 = s3Double();
  try {
    const dataUrl = await photoWithExif();
    await withEnv(() =>
      persistRemoteEmailImage({
        workspaceId: "ws_1", storeId: "store_1", remoteUrl: dataUrl, fileName: "shot.jpg",
      }),
    );
    const stored = s3.puts[0]!.Body;
    const meta = await sharp(stored).metadata();
    assert.equal(meta.exif, undefined, "no EXIF reaches the bucket");
    assert.doesNotMatch(stored.toString("latin1"), /Studio Tester|Camera X/);
  } finally {
    s3.restore();
  }
});

test("the checksum identifies the stored bytes, not the provider's", async () => {
  const s3 = s3Double();
  try {
    const dataUrl = await photoWithExif();
    const result = await withEnv(() =>
      persistRemoteEmailImage({
        workspaceId: "ws_1", storeId: "store_1", remoteUrl: dataUrl, fileName: "shot.jpg",
      }),
    );
    const { createHash } = await import("node:crypto");
    const ofStored = createHash("sha256").update(s3.puts[0]!.Body).digest("hex");
    assert.equal(result.checksum, ofStored, "the hash names what a recipient receives");
    assert.ok(result.url.includes(result.checksum));
  } finally {
    s3.restore();
  }
});

test("the same image in two workspaces is stored twice, never shared", async () => {
  const s3 = s3Double();
  try {
    const url = await photoWithExif();
    await withEnv(async () => {
      await persistRemoteEmailImage({ workspaceId: "ws_a", storeId: "s1", remoteUrl: url, fileName: "a.jpg" });
      await persistRemoteEmailImage({ workspaceId: "ws_b", storeId: "s1", remoteUrl: url, fileName: "a.jpg" });
    });
    assert.equal(s3.puts.length, 2);
    assert.notEqual(s3.puts[0]!.Key, s3.puts[1]!.Key);
    assert.match(s3.puts[0]!.Key, /workspaces\/ws_a\//);
    assert.match(s3.puts[1]!.Key, /workspaces\/ws_b\//);
  } finally {
    s3.restore();
  }
});

test("a non-image payload is refused before it reaches the bucket", async () => {
  const s3 = s3Double();
  try {
    await withEnv(async () => {
      await assert.rejects(() =>
        persistRemoteEmailImage({
          workspaceId: "ws_1", storeId: "s1",
          remoteUrl: "data:application/pdf;base64," + Buffer.from("%PDF-1.4").toString("base64"),
          fileName: "not-an-image.pdf",
        }),
      );
    });
    assert.equal(s3.puts.length, 0, "nothing was written");
  } finally {
    s3.restore();
  }
});

test("without configuration nothing is written anywhere", async () => {
  const s3 = s3Double();
  const saved = process.env["ASSET_BUCKET"];
  delete process.env["ASSET_BUCKET"];
  try {
    await assert.rejects(() =>
      persistRemoteEmailImage({
        workspaceId: "ws_1", storeId: "s1",
        remoteUrl: "data:image/png;base64,AAAA", fileName: "a.png",
      }),
    );
    assert.equal(s3.puts.length, 0);
  } finally {
    s3.restore();
    if (saved) process.env["ASSET_BUCKET"] = saved;
  }
});
