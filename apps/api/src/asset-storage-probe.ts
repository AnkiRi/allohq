import sharp from "sharp";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createEmailAssetUpload, publishUploadedEmailAsset } from "./lib/email-asset-storage";

/**
 * Probe the REAL bucket and CDN with the API's own key, before any Railway
 * variable is set. Run by the owner from their own shell:
 *
 *   ASSET_BUCKET=joon-assets-production-632404568116-eu-north-1-an \
 *   ASSET_REGION=eu-north-1 \
 *   ASSET_CDN_BASE_URL=https://<zone>.b-cdn.net \
 *   ASSET_AWS_ACCESS_KEY_ID=… ASSET_AWS_SECRET_ACCESS_KEY=… \
 *   pnpm --filter @allohq/api exec tsx src/asset-storage-probe.ts
 *
 * It writes one small generated image under `staging/workspaces/probe/…`,
 * publishes it to `workspaces/probe/stores/probe/email-assets/…`, and removes
 * what it staged. The published probe image stays (the API key cannot delete
 * published objects); the summary says how to remove it. No merchant data, no
 * email, no image provider.
 */
const ORIGIN = process.env["PROBE_ORIGIN"] ?? "https://agent.joonhq.com";
const TENANT = { workspaceId: "probe", storeId: "probe" };
const results: Array<{ check: string; outcome: "PASS" | "FAIL" | "INFO"; detail: string }> = [];
const record = (check: string, pass: boolean | null, detail: string) =>
  results.push({ check, outcome: pass === null ? "INFO" : pass ? "PASS" : "FAIL", detail });

async function main() {
  for (const name of ["ASSET_BUCKET", "ASSET_REGION", "ASSET_CDN_BASE_URL", "ASSET_AWS_ACCESS_KEY_ID", "ASSET_AWS_SECRET_ACCESS_KEY"]) {
    if (!process.env[name]) throw new Error(`${name} is required`);
  }
  if (process.env["ASSET_S3_ENDPOINT"]) throw new Error("ASSET_S3_ENDPOINT must be unset: this probe is for AWS itself");
  const bucket = process.env["ASSET_BUCKET"]!;
  const region = process.env["ASSET_REGION"]!;
  const cdn = process.env["ASSET_CDN_BASE_URL"]!.replace(/\/$/, "");
  const s3Direct = `https://${bucket}.s3.${region}.amazonaws.com`;
  const credentials = { accessKeyId: process.env["ASSET_AWS_ACCESS_KEY_ID"]!, secretAccessKey: process.env["ASSET_AWS_SECRET_ACCESS_KEY"]! };
  const image = await sharp({ create: { width: 120, height: 60, channels: 3, background: { r: 30, g: 110, b: 90 } } })
    .withExif({ IFD0: { Copyright: "probe-exif-marker" } } as never)
    .jpeg()
    .toBuffer();
  const staged: string[] = [];

  // 1. The shipped upload URL, and the bucket's CORS answer for the app's origin.
  const upload = await createEmailAssetUpload({ ...TENANT, fileName: "probe.jpg", mimeType: "image/jpeg", size: image.byteLength });
  staged.push(upload.key);
  const preflight = await fetch(upload.uploadUrl, { method: "OPTIONS", headers: {
    Origin: ORIGIN, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" } });
  record(`CORS preflight from ${ORIGIN}`, preflight.status === 200 && preflight.headers.get("access-control-allow-origin") === ORIGIN,
    `${preflight.status}, allow-origin ${preflight.headers.get("access-control-allow-origin")}`);
  const foreign = await fetch(upload.uploadUrl, { method: "OPTIONS", headers: {
    Origin: "https://example.org", "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" } });
  record("CORS preflight from another origin is refused", !foreign.headers.get("access-control-allow-origin"), `${foreign.status}`);

  const put = await fetch(upload.uploadUrl, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: image });
  record("shipped signed PUT (no request checksum)", put.status === 200, `${put.status} ${put.status === 200 ? "" : await put.text()}`);

  // 2. The SDK's default URL, which signs a CRC32 of an empty body: AWS's answer, for the record.
  const defaultKey = `staging/workspaces/probe/stores/probe/${Date.now()}-sdk-default`;
  staged.push(defaultKey);
  const defaultUrl = await getSignedUrl(new S3Client({ region, credentials }),
    new PutObjectCommand({ Bucket: bucket, Key: defaultKey, ContentType: "image/jpeg" }), { expiresIn: 600 });
  const defaultPut = await fetch(defaultUrl, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: image });
  record("SDK-default signed PUT (checksum AAAAAA==)", null, `AWS answered ${defaultPut.status} ${defaultPut.status === 200 ? "" : (await defaultPut.text()).slice(0, 200)}`);

  // 3. Staging is invisible to the CDN and the public.
  if (defaultPut.status === 200 || put.status === 200) {
    const visibleKey = defaultPut.status === 200 ? defaultKey : upload.key;
    const viaCdn = await fetch(`${cdn}/${visibleKey}`);
    record("CDN cannot read staging", viaCdn.status === 403 || viaCdn.status === 404, `${viaCdn.status}`);
  }
  const direct = await fetch(`${s3Direct}/${upload.key}`);
  record("anonymous S3 cannot read staging", direct.status === 403, `${direct.status}`);

  // 4. Publish through the real module, then read it the way a mail client does.
  if (put.status === 200) {
    const published = await publishUploadedEmailAsset({ ...TENANT, key: upload.key });
    record("published to a new content-addressed key", published.key.startsWith("workspaces/probe/"), published.key);
    const first = await fetch(published.url);
    const bytes = Buffer.from(await first.arrayBuffer());
    const meta = first.status === 200 ? await sharp(bytes).metadata().catch(() => null) : null;
    record("CDN serves the published image", first.status === 200 && meta?.format === "jpeg" && meta.width === 120,
      `${first.status} ${first.headers.get("content-type")} ${meta ? `${meta.width}x${meta.height}` : "undecodable"}`);
    record("published image carries no EXIF", meta?.exif === undefined && !bytes.toString("latin1").includes("probe-exif-marker"), "");
    record("published Content-Type and caching", first.headers.get("content-type") === "image/jpeg",
      `content-type ${first.headers.get("content-type")}, cache-control ${first.headers.get("cache-control")}`);
    const second = await fetch(published.url);
    record("CDN cache status on a repeat request", null, `cdn-cache ${second.headers.get("cdn-cache") ?? "(no header)"}`);
    const anonymous = await fetch(`${s3Direct}/${published.key}`);
    record("anonymous S3 cannot read the published image", anonymous.status === 403, `${anonymous.status}`);
    console.log([
      "",
      `  Published probe object: ${published.key}`,
      "  The bucket is versioned, so `aws s3 rm` only adds a delete marker and the image stays as a",
      "  noncurrent version (the staging lifecycle rule does not cover published prefixes).",
      "  To remove it completely, with your admin identity, delete every version and delete marker:",
      `    aws s3api list-object-versions --bucket ${bucket} --prefix ${published.key} \\`,
      "      --query '{versions: Versions[].VersionId, markers: DeleteMarkers[].VersionId}'",
      `    aws s3api delete-object --bucket ${bucket} --key ${published.key} --version-id <each id above>`,
      `  then purge ${published.url} in Bunny.`,
      "  Staging objects this probe deleted stay as noncurrent versions until the lifecycle rule removes them (about a day).",
      "",
    ].join("\n"));
  }

  // 5. The CDN's root must not list the bucket.
  const root = await fetch(`${cdn}/`);
  const body = await root.text();
  record("CDN root does not list objects", !body.includes("<ListBucketResult") && root.status !== 200, `${root.status}`);

  // Cleanup: whatever this probe staged and did not publish.
  const api = new S3Client({ region, credentials });
  for (const key of staged) await api.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
}

main()
  .catch((error: Error) => record("probe ran to completion", false, error.message))
  .finally(() => {
    for (const { check, outcome, detail } of results) console.log(`  ${outcome.padEnd(4)}  ${check}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = results.some((result) => result.outcome === "FAIL") ? 1 : 0;
  });
