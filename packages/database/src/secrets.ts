import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const PREFIX = "enc:v1";

function encryptionKey(): Buffer {
  const value = process.env["DATA_ENCRYPTION_KEY"];
  if (!value) {
    throw new Error(
      "DATA_ENCRYPTION_KEY is required for encrypted store credentials",
    );
  }

  const isHex = /^[a-f0-9]{64}$/i.test(value);
  const key = Buffer.from(value, isHex ? "hex" : "base64");
  if (key.length !== 32) {
    throw new Error(
      "DATA_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 or 64 hex characters)",
    );
  }
  return key;
}

/** Validate deployment configuration before a process starts serving work. */
export function assertDataEncryptionConfigured(): void {
  encryptionKey();
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(`${PREFIX}:`);
}

export function encryptSecret(value: string): string {
  if (!value) throw new Error("Cannot encrypt an empty secret");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(value: string): string {
  // Transitional compatibility for stores installed before encrypted-at-rest
  // credentials shipped. Re-saving/reconnecting the store upgrades the value.
  if (!isEncryptedSecret(value)) return value;

  const parts = value.split(":");
  if (
    parts.length !== 5 ||
    parts[0] !== "enc" ||
    parts[1] !== "v1" ||
    !parts[2] ||
    !parts[3] ||
    !parts[4]
  ) {
    throw new Error("Encrypted secret has an invalid format");
  }

  const iv = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  const ciphertext = Buffer.from(parts[4], "base64url");
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error("Encrypted secret has invalid authentication metadata");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

export function safeSecretEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
