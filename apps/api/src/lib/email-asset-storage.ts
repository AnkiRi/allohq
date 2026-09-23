import { createHash, randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";

const MAX_ASSET_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function storageConfig() {
  const bucket = process.env["ASSET_BUCKET"];
  const cdnBaseUrl = process.env["ASSET_CDN_BASE_URL"]?.replace(/\/$/, "");
  if (!bucket || !cdnBaseUrl) {
    throw new Error("Email asset storage is not configured. Set ASSET_BUCKET and ASSET_CDN_BASE_URL.");
  }
  const region = process.env["ASSET_REGION"] ?? process.env["AWS_REGION"] ?? "us-east-1";
  const endpoint = process.env["ASSET_S3_ENDPOINT"];
  const client = new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
  return { bucket, cdnBaseUrl, client };
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
  const { bucket, cdnBaseUrl, client } = storageConfig();
  const key = `workspaces/${input.workspaceId}/stores/${input.storeId}/email-assets/${randomUUID()}.${safeExtension(input.fileName, input.mimeType)}`;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: input.mimeType,
    CacheControl: "public,max-age=31536000,immutable",
    Metadata: { workspace: input.workspaceId, store: input.storeId },
  });
  return {
    key,
    uploadUrl: await getSignedUrl(client, command, { expiresIn: 600 }),
    publicUrl: `${cdnBaseUrl}/${key}`,
    expiresInSeconds: 600,
  };
}

export async function inspectUploadedEmailAsset(input: {
  workspaceId: string;
  storeId: string;
  key: string;
}) {
  const expectedPrefix = `workspaces/${input.workspaceId}/stores/${input.storeId}/email-assets/`;
  if (!input.key.startsWith(expectedPrefix)) throw new Error("Asset does not belong to this store.");
  const { bucket, cdnBaseUrl, client } = storageConfig();
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.key }));
  const mimeType = head.ContentType ?? "application/octet-stream";
  assertAssetInput(mimeType, Number(head.ContentLength ?? 0));

  // A merchant's file is uploaded straight to storage by the browser, so the
  // bytes sitting there are exactly what came off their device — EXIF, GPS and
  // all. Read it back, re-encode it without metadata, and overwrite. Joon
  // serves these at public URLs and mails them to strangers; publishing
  // somebody's coordinates because they attached a photo is not acceptable.
  const stored = await client.send(new GetObjectCommand({ Bucket: bucket, Key: input.key }));
  const raw = Buffer.from(await stored.Body!.transformToByteArray());
  const stripped = await stripImageMetadata(raw, mimeType);
  const checksum = createHash("sha256").update(stripped.body).digest("hex");
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    Body: stripped.body,
    ContentType: mimeType,
    CacheControl: "public,max-age=31536000,immutable",
    Metadata: { workspace: input.workspaceId, store: input.storeId, sha256: checksum },
  }));

  return {
    url: `${cdnBaseUrl}/${input.key}`,
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
  const key = `workspaces/${input.workspaceId}/stores/${input.storeId}/email-assets/${checksum}.${safeExtension(input.fileName, mimeType)}`;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: stripped.body,
    ContentType: mimeType,
    CacheControl: "public,max-age=31536000,immutable",
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
    CacheControl: "public,max-age=31536000,immutable",
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
