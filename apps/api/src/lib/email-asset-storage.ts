import { createHash, randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";

const MAX_ASSET_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
/** Published objects are content-addressed and never rewritten, so they may be cached for good. */
const IMMUTABLE = "public,max-age=31536000,immutable";
const FORMAT_MIME: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
const MIME_EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/**
 * A merchant's upload that cannot be published, with a message safe to show
 * them. Anything else thrown from here is an operational failure.
 */
export class EmailAssetRejectedError extends Error {}

/**
 * Where a browser's raw upload lands. Nothing under `staging/` is ever served:
 * the CDN's read key is scoped to published prefixes only, and the API deletes
 * a staging object once its sanitised copy is published (a bucket lifecycle
 * rule removes any that an interrupted upload leaves behind).
 */
export function stagingPrefix(input: { workspaceId: string; storeId: string }): string {
  return `staging/workspaces/${input.workspaceId}/stores/${input.storeId}/`;
}

/**
 * Overridable S3 client, so persistence can be exercised against a double.
 *
 * Storage is where workspace isolation is actually enforced — the object key
 * carries the tenant — and that cannot be left to inspection.
 */
let clientOverride: { send: (command: unknown) => Promise<unknown> } | null = null;
export function __setStorageClientForTests(client: typeof clientOverride) {
  clientOverride = client;
}

/** The object key for one asset. The tenant prefix is the isolation boundary. */
export function emailAssetKey(input: {
  workspaceId: string;
  storeId: string;
  checksum: string;
  extension: string;
}): string {
  return `workspaces/${input.workspaceId}/stores/${input.storeId}/email-assets/${input.checksum}.${input.extension}`;
}

function storageConfig() {
  const bucket = process.env["ASSET_BUCKET"];
  const cdnBaseUrl = process.env["ASSET_CDN_BASE_URL"]?.replace(/\/$/, "");
  if (!bucket || !cdnBaseUrl) {
    throw new Error("Email asset storage is not configured. Set ASSET_BUCKET and ASSET_CDN_BASE_URL.");
  }
  const region = process.env["ASSET_REGION"] ?? process.env["AWS_REGION"] ?? "us-east-1";
  const endpoint = process.env["ASSET_S3_ENDPOINT"];
  // Storage's own key when set, so it never has to share one with SES (whose
  // clients use the default AWS credential chain). Falls back to that chain.
  const accessKeyId = process.env["ASSET_AWS_ACCESS_KEY_ID"]?.trim();
  const secretAccessKey = process.env["ASSET_AWS_SECRET_ACCESS_KEY"]?.trim();
  const options = {
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  };
  const client = (clientOverride ?? new S3Client(options)) as S3Client;
  // Presigning uses its own client. By default the SDK puts a CRC32 of the
  // request body into the URL, and a presigned PUT has no body yet, so every
  // URL carried the checksum of an EMPTY file (AAAAAA==). AWS accepted both
  // forms in the live probe (HTTP 200), so this is not a fix for a failure
  // seen on AWS: it removes a value that can never describe the upload, which
  // stricter S3-compatible stores reject. Server-side writes keep the default:
  // there the body is real.
  const signer = new S3Client({ ...options, requestChecksumCalculation: "WHEN_REQUIRED" });
  return { bucket, cdnBaseUrl, client, signer };
}

function safeExtension(fileName: string, mimeType: string) {
  const known = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  return extension && ["jpg", "jpeg", "png", "webp", "gif"].includes(extension)
    ? extension
    : known ?? "bin";
}

function assertAssetInput(mimeType: string, size: number) {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error("Use a JPEG, PNG, WebP or GIF image.");
  if (!Number.isFinite(size) || size <= 0 || size > MAX_ASSET_BYTES) {
    throw new Error("Image must be between 1 byte and 12 MB.");
  }
}

export async function createEmailAssetUpload(input: {
  workspaceId: string;
  storeId: string;
  fileName: string;
  mimeType: string;
  size: number;
}) {
  assertAssetInput(input.mimeType, input.size);
  const { bucket, signer } = storageConfig();
  // No public URL is returned: the raw bytes go to staging, which is never
  // served. The URL a merchant and their recipients see comes only from
  // `publishUploadedEmailAsset`, for the sanitised copy.
  const key = `${stagingPrefix(input)}${randomUUID()}`;
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: input.mimeType });
  return {
    key,
    uploadUrl: await getSignedUrl(signer, command, { expiresIn: 600 }),
    expiresInSeconds: 600,
  };
}

/** The image type the bytes actually are, whatever the browser declared. */
async function detectImageType(body: Buffer): Promise<string | null> {
  try {
    const { format } = await sharp(body).metadata();
    return (format && FORMAT_MIME[format]) ?? null;
  } catch {
    return null;
  }
}

/**
 * Publish a browser upload: read the raw staging object, re-encode it without
 * metadata, write the clean bytes to a NEW content-addressed key, then remove
 * the staging object.
 *
 * The browser uploads straight to storage, so the staged bytes are exactly
 * what came off the merchant's device, EXIF and GPS included. They are never
 * served. The published key is derived from the clean bytes, so it is written
 * once and never replaced, and a CDN can cache it indefinitely without ever
 * holding a raw or superseded image.
 */
export async function publishUploadedEmailAsset(input: {
  workspaceId: string;
  storeId: string;
  key: string;
}) {
  const staging = stagingPrefix(input);
  if (!input.key.startsWith(staging) || input.key.slice(staging.length).includes("/")) {
    throw new EmailAssetRejectedError("This upload does not belong to this store.");
  }
  const { bucket, cdnBaseUrl, client } = storageConfig();
  const discard = () =>
    client.send(new DeleteObjectCommand({ Bucket: bucket, Key: input.key })).catch(() => undefined);

  let size: number;
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.key }));
    size = Number(head.ContentLength ?? 0);
  } catch (error) {
    // Without list permission S3 answers a missing key with 403, not 404, so
    // both mean the same thing here: nothing arrived (an interrupted upload
    // creates no object) or the staging copy has already expired.
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 403 || status === 404) {
      throw new EmailAssetRejectedError("The upload did not arrive. Try adding the image again.");
    }
    throw error;
  }
  if (!(size > 0 && size <= MAX_ASSET_BYTES)) {
    await discard();
    throw new EmailAssetRejectedError("Image must be between 1 byte and 12 MB.");
  }

  const stored = await client.send(new GetObjectCommand({ Bucket: bucket, Key: input.key }));
  const raw = Buffer.from(await stored.Body!.transformToByteArray());
  const mimeType = await detectImageType(raw);
  if (!mimeType) {
    await discard();
    throw new EmailAssetRejectedError("Use a JPEG, PNG, WebP or GIF image.");
  }
  const stripped = await stripImageMetadata(raw, mimeType).catch(() => null);
  if (!stripped) {
    await discard();
    throw new EmailAssetRejectedError("This image could not be read. Try saving it again as JPEG or PNG.");
  }
  const checksum = createHash("sha256").update(stripped.body).digest("hex");
  const key = emailAssetKey({
    workspaceId: input.workspaceId,
    storeId: input.storeId,
    checksum,
    extension: MIME_EXTENSION[mimeType]!,
  });
  // A failure here leaves the staging object in place, so the same completion
  // can simply be retried; the key is the same either way.
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: stripped.body,
    ContentType: mimeType,
    CacheControl: IMMUTABLE,
    Metadata: { workspace: input.workspaceId, store: input.storeId, sha256: checksum },
  }));
  // Published. A failed delete is not a failed upload: the lifecycle rule on
  // `staging/` removes the leftover, and it was never readable by the CDN.
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: input.key })).catch((error: Error) => {
    console.warn(`[email-assets] staging cleanup left to the lifecycle rule: ${error.name}`);
  });

  return {
    key,
    url: `${cdnBaseUrl}/${key}`,
    mimeType,
    size: stripped.body.byteLength,
    width: stripped.width,
    height: stripped.height,
    checksum,
  };
}

/**
 * Re-encode an image so no metadata survives into a hosted asset.
 *
 * A merchant's phone photo carries EXIF, which routinely includes GPS
 * coordinates, device serials and timestamps. Joon hosts these files at
 * public CDN URLs and mails them to strangers, so shipping that metadata
 * through would publish someone's home address as a side effect of adding a
 * picture to an email.
 *
 * sharp drops metadata unless explicitly asked to keep it, so a re-encode is
 * the whole job. Orientation is applied first, because that IS carried in EXIF
 * and dropping it without rotating would turn photographs sideways.
 *
 * This is metadata removal only. It is NOT malware scanning and NOT content
 * moderation — neither is implemented, and nothing here should be read as
 * either.
 */
export async function stripImageMetadata(
  body: Buffer,
  mimeType: string,
): Promise<{ body: Buffer; width: number | null; height: number | null }> {
  const pipeline = sharp(body).rotate();
  const encoded =
    mimeType === "image/jpeg"
      ? await pipeline.jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true })
      : mimeType === "image/webp"
        ? await pipeline.webp({ quality: 90 }).toBuffer({ resolveWithObject: true })
        : mimeType === "image/gif"
          ? await pipeline.gif().toBuffer({ resolveWithObject: true })
          : await pipeline.png().toBuffer({ resolveWithObject: true });
  return {
    body: encoded.data,
    width: encoded.info.width ?? null,
    height: encoded.info.height ?? null,
  };
}

export async function persistRemoteEmailImage(input: {
  workspaceId: string;
  storeId: string;
  remoteUrl: string;
  fileName: string;
}) {
  const response = await fetch(input.remoteUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Generated image download failed (${response.status}).`);
  const body = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
  assertAssetInput(mimeType, body.byteLength);
  const stripped = await stripImageMetadata(body, mimeType);
  // Checksum the bytes actually stored, so the content hash identifies what a
  // recipient receives rather than what a provider happened to return.
  const checksum = createHash("sha256").update(stripped.body).digest("hex");
  const { bucket, cdnBaseUrl, client } = storageConfig();
  const key = emailAssetKey({ workspaceId: input.workspaceId, storeId: input.storeId, checksum, extension: safeExtension(input.fileName, mimeType) });
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: stripped.body,
    ContentType: mimeType,
    CacheControl: IMMUTABLE,
    Metadata: { workspace: input.workspaceId, store: input.storeId, sha256: checksum },
  }));
  return {
    key,
    url: `${cdnBaseUrl}/${key}`,
    mimeType,
    width: stripped.width,
    height: stripped.height,
    size: stripped.body.byteLength,
    checksum,
  };
}

/**
 * Product-safe visual generation: the model creates only the setting, while
 * authoritative product pixels are resized and composited unchanged. This
 * avoids silently redrawing labels, packaging or garment details.
 */
export async function persistProductSafeComposite(input: {
  workspaceId: string;
  storeId: string;
  backgroundUrl: string;
  productUrl: string;
  fileName: string;
}) {
  const [backgroundResponse, productResponse] = await Promise.all([
    fetch(input.backgroundUrl, { signal: AbortSignal.timeout(30_000) }),
    fetch(input.productUrl, { signal: AbortSignal.timeout(30_000) }),
  ]);
  if (!backgroundResponse.ok) throw new Error(`Generated background download failed (${backgroundResponse.status}).`);
  if (!productResponse.ok) throw new Error(`Product image download failed (${productResponse.status}).`);
  const background = Buffer.from(await backgroundResponse.arrayBuffer());
  const product = Buffer.from(await productResponse.arrayBuffer());
  const canvas = await sharp(background)
    .resize(1200, 600, { fit: "cover" })
    .png()
    .toBuffer();
  const productLayer = await sharp(product)
    .resize(620, 500, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const composed = await sharp(canvas)
    .composite([{ input: productLayer, gravity: "center" }])
    .png({ quality: 92 })
    .toBuffer();
  assertAssetInput("image/png", composed.byteLength);
  const checksum = createHash("sha256").update(composed).digest("hex");
  const { bucket, cdnBaseUrl, client } = storageConfig();
  const key = `workspaces/${input.workspaceId}/stores/${input.storeId}/email-assets/${checksum}.png`;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: composed,
    ContentType: "image/png",
    CacheControl: IMMUTABLE,
    Metadata: { workspace: input.workspaceId, store: input.storeId, sha256: checksum, composite: "product-safe" },
  }));
  return {
    key,
    url: `${cdnBaseUrl}/${key}`,
    mimeType: "image/png",
    width: 1200,
    height: 600,
    size: composed.byteLength,
    checksum,
  };
}
