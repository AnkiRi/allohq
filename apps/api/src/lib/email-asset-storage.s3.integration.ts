import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, request as httpRequest, type Server } from "node:http";
import { join, resolve } from "node:path";
import sharp from "sharp";

/**
 * The whole storage path, against a real S3 server and a real browser.
 *
 *   browser PUT (signed URL, CORS) → private staging → API reads and strips
 *   metadata → clean copy at a new published key → CDN-scoped read key GETs it
 *   → Asset Library and email preview carry its URL
 *
 * The server is MinIO, configured with the SAME policy documents we ask AWS to
 * use (docs/asset-storage/*.json): an API user and a CDN read user. The CDN's
 * signed origin fetch is exactly an S3 GetObject made with the read user's
 * key, so that is what "the CDN" does here. The browser is the system Chrome.
 *
 * What this cannot prove, and the production canary must: AWS's own answer to
 * the same requests, the real CORS rule, and Bunny's S3 authentication.
 *
 * Runs only when a test S3 server is configured (see asset-storage.yml).
 */
const endpoint = process.env["ASSET_S3_TEST_ENDPOINT"];
const databaseUrl = process.env["TEST_DATABASE_URL"];
const skip = endpoint && databaseUrl ? false : "ASSET_S3_TEST_ENDPOINT and TEST_DATABASE_URL are required";
const PAGE_PORT = Number(process.env["ASSET_TEST_PAGE_PORT"] ?? 4173);
const repoRoot = resolve(process.env["INIT_CWD"] ?? process.cwd(), process.env["INIT_CWD"] ? "." : "../..");

type Credentials = { accessKeyId: string; secretAccessKey: string };
const creds = (key: string, secret: string): Credentials => ({
  accessKeyId: process.env[key] ?? "", secretAccessKey: process.env[secret] ?? "",
});

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  process.env["ASSET_S3_ENDPOINT"] = endpoint;
  const { prisma } = await import("@allohq/database");
  const { emailsRouter } = await import("../routers/emails");
  const { assetsRouter } = await import("../routers/assets");
  const s3 = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const { chromium } = await import("playwright-core");
  return { prisma, emailsRouter, assetsRouter, s3, getSignedUrl, chromium };
}
type Loaded = Awaited<ReturnType<typeof load>>;

let loaded: Loaded;
let server: Server;
let browser: Awaited<ReturnType<Loaded["chromium"]["launch"]>>;
let fixture: { workspaceId: string; storeId: string; userId: string; clerkId: string };
const bucket = () => process.env["ASSET_BUCKET"]!;
const client = (credentials: Credentials) =>
  new loaded.s3.S3Client({ region: process.env["ASSET_REGION"]!, endpoint, forcePathStyle: true, credentials });
const admin = () => client(creds("ASSET_TEST_ADMIN_KEY", "ASSET_TEST_ADMIN_SECRET"));
/** What Bunny's S3 Authentication does: a signed GetObject with its own read key. */
const cdn = () => client(creds("ASSET_TEST_CDN_KEY", "ASSET_TEST_CDN_SECRET"));

async function status(run: () => Promise<unknown>): Promise<number> {
  try {
    await run();
    return 200;
  } catch (error) {
    return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? -1;
  }
}
const exists = (key: string) => status(() => admin().send(new loaded.s3.HeadObjectCommand({ Bucket: bucket(), Key: key })));
const anonymousGet = async (key: string) => (await fetch(`${endpoint}/${bucket()}/${key}`)).status;

const api = () => {
  const context = { prisma: loaded.prisma, userId: fixture.clerkId, workspaceId: fixture.workspaceId, isDemo: false,
    authSource: "clerk" as const, clientIp: "10.0.0.9", closedBeta: false };
  return {
    emails: loaded.emailsRouter.createCaller(context as never),
    assets: loaded.assetsRouter.createCaller(context as never),
  };
};

/** PUT from a page served at `origin`, in the real browser. Returns the HTTP status, or "blocked". */
async function browserPut(origin: string, url: string, body: Buffer, contentType: string): Promise<number | "blocked"> {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/`);
    return await page.evaluate(async ({ url, base64, contentType }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      try {
        const response = await fetch(url, { method: "PUT", headers: { "content-type": contentType }, body: new Blob([bytes], { type: contentType }) });
        return response.status;
      } catch {
        return "blocked" as const;
      }
    }, { url, base64: body.toString("base64"), contentType });
  } finally {
    await page.close();
  }
}
const APP_ORIGIN = `http://127.0.0.1:${PAGE_PORT}`;
const OTHER_ORIGIN = `http://localhost:${PAGE_PORT}`;

const photo = () =>
  sharp({ create: { width: 64, height: 32, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    .withExif({ IFD0: { Copyright: "Priya at home", Model: "Phone X" }, IFD3: { GPSLatitudeRef: "N" } } as never)
    .jpeg()
    .toBuffer();

async function upload(body: Buffer, contentType = "image/jpeg") {
  const created = await api().emails.createAssetUpload({
    storeId: fixture.storeId, fileName: "shot.jpg", mimeType: contentType as never, size: body.byteLength,
  });
  return { ...created, status: await browserPut(APP_ORIGIN, created.uploadUrl, body, contentType) };
}

before(async () => {
  if (skip) return;
  loaded = await load();
  server = createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><title>studio</title>"); });
  await new Promise<void>((done) => server.listen(PAGE_PORT, "0.0.0.0", done));
  browser = await loaded.chromium.launch(process.env["CHROME_PATH"] ? { executablePath: process.env["CHROME_PATH"] } : { channel: "chrome" });
  const tag = randomUUID().slice(0, 8);
  const workspace = await loaded.prisma.workspace.create({ data: { name: `S3 ${tag}`, slug: `s3-${tag}` } });
  const clerkId = `user_s3_${tag}`;
  const user = await loaded.prisma.user.create({ data: { clerkId, email: `s3-${tag}@example.test`, name: "Storage Tester" } });
  await loaded.prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "owner" } });
  const store = await loaded.prisma.store.create({
    data: { workspaceId: workspace.id, platform: "shopify", shopDomain: `s3-${tag}.myshopify.com`, accessToken: "ciphertext", isActive: true },
  });
  fixture = { workspaceId: workspace.id, storeId: store.id, userId: user.id, clerkId };
});

after(async () => {
  if (skip) return;
  await browser?.close();
  await new Promise((done) => server?.close(done));
  await loaded.prisma.brandAsset.deleteMany({ where: { workspaceId: fixture.workspaceId } });
  await loaded.prisma.store.deleteMany({ where: { id: fixture.storeId } });
  await loaded.prisma.workspace.deleteMany({ where: { id: fixture.workspaceId } });
  await loaded.prisma.user.deleteMany({ where: { id: fixture.userId } });
  await loaded.prisma.$disconnect();
});

test("the browser's signed PUT lands in private staging, which neither the CDN key nor the public can read", { skip }, async () => {
  const staged = await upload(await photo());
  assert.equal(staged.status, 200, "the real browser upload succeeded, CORS preflight included");
  assert.ok(staged.key.startsWith("staging/"), staged.key);
  assert.equal(await exists(staged.key), 200);
  assert.equal(await status(() => cdn().send(new loaded.s3.GetObjectCommand({ Bucket: bucket(), Key: staged.key }))), 403,
    "the CDN's read key cannot read raw uploads");
  assert.equal(await anonymousGet(staged.key), 403);
});

test("completing publishes a clean copy the CDN key can read and the public cannot; staging is removed", { skip }, async () => {
  const staged = await upload(await photo());
  const asset = await api().emails.completeAssetUpload({ storeId: fixture.storeId, key: staged.key, fileName: "shot.jpg", type: "reference_image" });

  const published = asset.storageKey!;
  assert.match(published, /^workspaces\/.+\/email-assets\/[0-9a-f]{64}\.jpg$/);
  assert.equal(asset.url, `${process.env["ASSET_CDN_BASE_URL"]}/${published}`, "the saved URL is the published key on the CDN host");
  assert.equal(await exists(staged.key), 404, "the raw staging object is gone");

  const object = await cdn().send(new loaded.s3.GetObjectCommand({ Bucket: bucket(), Key: published }));
  assert.equal(object.ContentType, "image/jpeg");
  assert.equal(object.CacheControl, "public,max-age=31536000,immutable");
  const bytes = Buffer.from(await object.Body!.transformToByteArray());
  const meta = await sharp(bytes).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["jpeg", 64, 32], "the right image, intact");
  assert.equal(meta.exif, undefined, "no EXIF is served");
  assert.doesNotMatch(bytes.toString("latin1"), /Priya at home|Phone X/);

  assert.equal(await anonymousGet(published), 403, "direct anonymous S3 access fails");

  // Save and reload: the Asset Library and the email preview carry the CDN URL.
  const library = await api().assets.library({ storeId: fixture.storeId });
  assert.ok(library.uploads.some((item: { url: string }) => item.url === asset.url), "listed under Uploads after reload");
  const preview = await api().emails.renderPreview({
    storeId: fixture.storeId,
    blocks: [{ id: "i", type: "image", props: { src: asset.url, alt: "Shot" } }] as never,
  });
  assert.ok(JSON.stringify(preview).includes(asset.url), "the email preview renders the published URL");
});

test("the CDN key cannot list the bucket or write; the API key cannot read published images or list", { skip }, async () => {
  const list = (credentials: Credentials) => status(() => client(credentials).send(new loaded.s3.ListObjectsV2Command({ Bucket: bucket() })));
  assert.equal(await list(creds("ASSET_TEST_CDN_KEY", "ASSET_TEST_CDN_SECRET")), 403, "the CDN root cannot list objects");
  assert.equal(await list(creds("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")), 403);
  assert.equal(await status(() => cdn().send(new loaded.s3.PutObjectCommand({
    Bucket: bucket(), Key: `workspaces/${fixture.workspaceId}/stores/${fixture.storeId}/email-assets/x.jpg`, Body: "x" }))), 403);
  const anyPublished = (await api().assets.library({ storeId: fixture.storeId })).uploads[0] as { url: string } | undefined;
  assert.ok(anyPublished, "an earlier test published an upload");
  const key = anyPublished.url.slice(`${process.env["ASSET_CDN_BASE_URL"]}/`.length);
  assert.equal(await status(() => client(creds("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")).send(
    new loaded.s3.GetObjectCommand({ Bucket: bucket(), Key: key }))), 403, "the API cannot read what it published");
});

test("a page on another origin cannot use the upload URL", { skip }, async () => {
  const created = await api().emails.createAssetUpload({ storeId: fixture.storeId, fileName: "a.jpg", mimeType: "image/jpeg", size: 10 });
  assert.equal(await browserPut(OTHER_ORIGIN, created.uploadUrl, Buffer.from("0123456789"), "image/jpeg"), "blocked");
  assert.equal(await exists(created.key), 404);
});

test("an upload cut off mid-PUT creates no object; completing it publishes nothing and says so", { skip }, async () => {
  const created = await api().emails.createAssetUpload({ storeId: fixture.storeId, fileName: "big.jpg", mimeType: "image/jpeg", size: 4_000_000 });
  await new Promise<void>((done) => {
    const url = new URL(created.uploadUrl);
    const req = httpRequest(url, { method: "PUT", headers: { "content-type": "image/jpeg", "content-length": 4_000_000 } });
    req.on("error", () => done());
    req.write(Buffer.alloc(1_000_000), () => { req.destroy(); setTimeout(done, 500); });
  });
  assert.equal(await exists(created.key), 404, "S3 stores nothing from an incomplete PUT");
  const before = await publishedCount();
  await assert.rejects(
    api().emails.completeAssetUpload({ storeId: fixture.storeId, key: created.key, fileName: "big.jpg", type: "reference_image" }),
    /did not arrive/);
  assert.equal(await publishedCount(), before);
});

test("an upload never completed stays unreadable, and the staging lifecycle rule is valid S3 configuration", { skip }, async () => {
  const staged = await upload(await photo());
  assert.equal(staged.status, 200);
  assert.equal(await status(() => cdn().send(new loaded.s3.GetObjectCommand({ Bucket: bucket(), Key: staged.key }))), 403);
  const rules = JSON.parse(readFileSync(join(repoRoot, "docs/asset-storage/s3-lifecycle.json"), "utf8"));
  await admin().send(new loaded.s3.PutBucketLifecycleConfigurationCommand({ Bucket: bucket(), LifecycleConfiguration: rules }));
  const applied = await admin().send(new loaded.s3.GetBucketLifecycleConfigurationCommand({ Bucket: bucket() }));
  const rule = applied.Rules?.find((candidate) => candidate.ID === "expire-unpublished-uploads");
  assert.equal(rule?.Filter?.Prefix, "staging/");
  assert.equal(rule?.Expiration?.Days, 1);
  // The bucket is versioned: a deleted staging object stays as a noncurrent
  // version until this removes it, a day later.
  assert.equal(rule?.NoncurrentVersionExpiration?.NoncurrentDays, 1);
  assert.equal(rule?.AbortIncompleteMultipartUpload?.DaysAfterInitiation, 1);
});

test("in the versioned bucket, a published upload's raw bytes survive only as a noncurrent version nobody but the owner can read", { skip }, async () => {
  const staged = await upload(await photo());
  await api().emails.completeAssetUpload({ storeId: fixture.storeId, key: staged.key, fileName: "shot.jpg", type: "reference_image" });
  const versions = await admin().send(new loaded.s3.ListObjectVersionsCommand({ Bucket: bucket(), Prefix: staged.key }));
  const raw = (versions.Versions ?? []).filter((version) => version.Key === staged.key);
  const markers = (versions.DeleteMarkers ?? []).filter((marker) => marker.Key === staged.key);
  assert.equal(markers.length, 1, "deleting the staging object added a delete marker");
  assert.equal(raw.length, 1, "the raw upload is still there as one noncurrent version");
  assert.equal(raw[0]!.IsLatest, false);
  // Naming the old version explicitly needs s3:GetObjectVersion, which neither
  // the CDN's key nor the API's key has.
  const byVersion = (credentials: Credentials) => status(() => client(credentials).send(
    new loaded.s3.GetObjectCommand({ Bucket: bucket(), Key: staged.key, VersionId: raw[0]!.VersionId })));
  assert.equal(await byVersion(creds("ASSET_TEST_CDN_KEY", "ASSET_TEST_CDN_SECRET")), 403);
  assert.equal(await byVersion(creds("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")), 403);
  assert.equal((await fetch(`${endpoint}/${bucket()}/${staged.key}?versionId=${raw[0]!.VersionId}`)).status, 403);
});

test("a file that is not an image is refused, its staging copy removed, and nothing is published", { skip }, async () => {
  const before = await publishedCount();
  const staged = await upload(Buffer.from("%PDF-1.4 definitely not a picture"), "image/png");
  assert.equal(staged.status, 200);
  await assert.rejects(
    api().emails.completeAssetUpload({ storeId: fixture.storeId, key: staged.key, fileName: "x.png", type: "reference_image" }),
    /JPEG, PNG, WebP or GIF/);
  assert.equal(await exists(staged.key), 404);
  assert.equal(await publishedCount(), before);
});

test("request checksums: the shipped URL uploads from a browser; the SDK default is recorded for comparison", { skip }, async () => {
  const body = await photo();
  const shipped = await upload(body);
  assert.equal(shipped.status, 200);
  const defaultSigner = client(creds("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"));
  const key = `staging/workspaces/${fixture.workspaceId}/stores/${fixture.storeId}/${randomUUID()}`;
  const url = await loaded.getSignedUrl(defaultSigner, new loaded.s3.PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: "image/jpeg" }), { expiresIn: 600 });
  const result = await browserPut(APP_ORIGIN, url, body, "image/jpeg");
  console.log(`  SDK-default presigned URL (x-amz-checksum-crc32=${new URL(url).searchParams.get("x-amz-checksum-crc32")}) → this server answered ${result}`);
});

async function publishedCount(): Promise<number> {
  const listed = await admin().send(new loaded.s3.ListObjectsV2Command({
    Bucket: bucket(), Prefix: `workspaces/${fixture.workspaceId}/` }));
  return listed.KeyCount ?? 0;
}
