/**
 * Whether durable asset storage is actually usable, decided before a merchant
 * starts anything that needs it.
 *
 * Production failed at the END of an upload and at the end of a generation
 * with "Email asset storage is not configured. Set ASSET_BUCKET and
 * ASSET_CDN_BASE_URL." — which is both a bad merchant experience (the work is
 * already done and thrown away) and a leak of how the system is deployed.
 *
 * That message was also incomplete: the S3 client authenticates through the
 * AWS credential chain, so a bucket and a CDN URL alone are not enough.
 */

export type AssetStorageStatus = {
  configured: boolean;
  /** Operator-facing. Never rendered in the Studio. */
  missing: string[];
  /** Merchant-facing. Names nothing about the deployment. */
  merchantMessage: string | null;
};

const MERCHANT_MESSAGE =
  "Uploads and generated images are not available for this workspace yet. Joon will not start work it cannot save.";

/**
 * Credentials may come from environment variables OR from an instance role,
 * so their absence is reported as a warning rather than treated as decisive:
 * on Railway there is no instance role, but that is a deployment fact this
 * module should not assume.
 */
function hasExplicitCredentials(): boolean {
  return Boolean(
    process.env["AWS_ACCESS_KEY_ID"]?.trim() && process.env["AWS_SECRET_ACCESS_KEY"]?.trim(),
  );
}

export function assetStorageStatus(): AssetStorageStatus {
  const missing: string[] = [];
  if (!process.env["ASSET_BUCKET"]?.trim()) missing.push("ASSET_BUCKET");
  if (!process.env["ASSET_CDN_BASE_URL"]?.trim()) missing.push("ASSET_CDN_BASE_URL");
  if (!hasExplicitCredentials()) {
    missing.push("AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (or an instance role)");
  }

  const configured = missing.length === 0;
  return {
    configured,
    missing,
    merchantMessage: configured ? null : MERCHANT_MESSAGE,
  };
}

/** True when a merchant may be offered uploads and generated imagery. */
export function assetStorageAvailable(): boolean {
  return assetStorageStatus().configured;
}
