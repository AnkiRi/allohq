import { createHmac } from "node:crypto";

/** Pseudonymous network evidence: useful for abuse/audit without retaining raw IP. */
export function consentRequestEvidence(input: { ip?: string; userAgent?: string; secret?: string }) {
  const ip = input.ip?.split(",")[0]?.trim();
  const secret = input.secret?.trim();
  return {
    ...(ip && secret ? { ipHash: createHmac("sha256", secret).update(ip).digest("hex") } : {}),
    ...(input.userAgent ? { userAgent: input.userAgent.slice(0, 256) } : {}),
  };
}
