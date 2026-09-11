import { createHash, randomBytes } from "node:crypto";
import { landingEventSchema } from "./landing-event-schema";

export const LANDING_EVENT_MAX_BYTES = 2_048;
export const LANDING_EVENT_RETENTION_DAYS = 90;

const salt = randomBytes(32);
const buckets = new Map<string, { count: number; resetAt: number }>();
let globalBucket = { count: 0, resetAt: 0 };

function anonymousKey(ip: string): string {
  return createHash("sha256").update(salt).update(ip).digest("hex");
}

export function landingEventAllowed(ip: string, now = Date.now()): boolean {
  const minute = 60_000;
  if (globalBucket.resetAt <= now) globalBucket = { count: 0, resetAt: now + minute };
  if (globalBucket.count >= 300) return false;
  const key = anonymousKey(ip || "unknown");
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + minute } : current;
  if (bucket.count >= 30) return false;
  bucket.count += 1;
  globalBucket.count += 1;
  buckets.set(key, bucket);
  if (buckets.size > 2_000) {
    for (const [candidate, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(candidate);
      if (buckets.size <= 1_500) break;
    }
  }
  return true;
}

export function requestIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")
    || "unknown";
}

export function isSameOriginBrowserRequest(request: Pick<Request, "headers" | "url">): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") return true;
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export function parseLandingEventBody(body: string) {
  if (new TextEncoder().encode(body).byteLength > LANDING_EVENT_MAX_BYTES) return null;
  try {
    const parsed = landingEventSchema.safeParse(body ? JSON.parse(body) : null);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function readBoundedBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > LANDING_EVENT_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
