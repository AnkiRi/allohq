import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { redisConnection } from "../config";
import { prisma } from "@allohq/database";
import { selectedEmailProvider, SesProvisioningService, warmupDailyCap } from "@allohq/messaging";

export type EmailCapacityReason = "daily_cap" | "store_concurrency" | "provider_rate";

export interface EmailCapacityPolicy {
  dailyCap: number;
  storeConcurrency: number;
  providerPerMinute: number;
  providerWindowMs: number;
  /**
   * Provider-wide sends per second, shared by every tenant. The per-minute
   * budget alone let a whole minute's sends go out in the first second, and
   * Resend refuses a team above 10 requests a second.
   */
  providerPerSecond: number;
  leaseMs: number;
}

const DAY_MS = 86_400_000;
const NEW_STORE_DAYS = 7;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function emailCapacityPolicy(installedAt: Date, now = new Date()): EmailCapacityPolicy {
  const ageDays = Math.max(0, (now.getTime() - installedAt.getTime()) / DAY_MS);
  return {
    dailyCap: ageDays < NEW_STORE_DAYS
      ? positiveInt(process.env["EMAIL_NEW_STORE_DAILY_CAP"], 100)
      : positiveInt(process.env["EMAIL_STORE_DAILY_CAP"], 10_000),
    storeConcurrency: positiveInt(process.env["EMAIL_STORE_CONCURRENCY"], 2),
    providerPerMinute: positiveInt(process.env["EMAIL_PROVIDER_PER_MINUTE"], 100),
    providerWindowMs: 60_000,
    // 80% of Resend's documented 10 requests/second per team.
    providerPerSecond: positiveInt(process.env["EMAIL_PROVIDER_PER_SECOND"], 8),
    leaseMs: positiveInt(process.env["EMAIL_CAPACITY_LEASE_MS"], 120_000),
  };
}

const ACQUIRE_SCRIPT = `
local now = tonumber(ARGV[1])
local token = ARGV[2]
local dailyCap = tonumber(ARGV[3])
local concurrencyCap = tonumber(ARGV[4])
local providerCap = tonumber(ARGV[5])
local leaseMs = tonumber(ARGV[6])

local perSecondCap = tonumber(ARGV[9])

redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
if tonumber(redis.call('GET', KEYS[1]) or '0') >= dailyCap then return {'daily_cap'} end
if tonumber(redis.call('ZCARD', KEYS[2])) >= concurrencyCap then
  -- When the earliest lease in the store runs out, as a retry hint.
  local earliest = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
  return {'store_concurrency', earliest[2] or tostring(now)}
end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= providerCap then return {'provider_rate', 'window'} end
if tonumber(redis.call('GET', KEYS[4]) or '0') >= perSecondCap then return {'provider_rate', 'second'} end

redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[7]))
redis.call('ZADD', KEYS[2], now + leaseMs, token)
redis.call('PEXPIRE', KEYS[2], leaseMs * 2)
redis.call('INCR', KEYS[3])
redis.call('PEXPIRE', KEYS[3], tonumber(ARGV[8]))
redis.call('INCR', KEYS[4])
redis.call('PEXPIRE', KEYS[4], 2000)
return {'allowed'}
`;

let redis: Redis | undefined;
function capacityRedis(): Redis {
  redis ??= new Redis({ ...(redisConnection as object), maxRetriesPerRequest: null });
  return redis;
}

export interface EmailCapacityLease {
  allowed: boolean;
  reason?: EmailCapacityReason;
  /**
   * For a pacing refusal (store concurrency or provider rate): how long to
   * wait before asking again. A refusal is a "not yet", never a failure.
   */
  retryAfterMs?: number;
  release(): Promise<void>;
}

/** Sends one store may have in flight at once; delivery never starts more than this. */
export function storeSendConcurrency(): number {
  return emailCapacityPolicy(new Date(0)).storeConcurrency;
}

const jitter = (ms: number) => Math.floor(Math.random() * ms);

export async function acquireEmailCapacity(storeId: string, installedAt: Date): Promise<EmailCapacityLease> {
  const client = capacityRedis();
  const now = new Date();
  const policy = emailCapacityPolicy(installedAt, now);
  // Prisma's upsert is a read-then-write here, not INSERT ... ON CONFLICT, so
  // concurrent sends for a store with no warm-up row raced and one of them
  // threw `Unique constraint failed on (storeId)` — a send failing outright
  // rather than being admitted or cleanly refused. The insert is made
  // conflict-tolerant and the row is then read back; a loser of the race reads
  // the winner's row.
  let warmup = await prisma.sesWarmupState.findUnique({ where: { storeId } });
  if (!warmup) {
    await prisma.sesWarmupState.createMany({
      data: [{ storeId, startedAt: now }],
      skipDuplicates: true,
    });
    warmup = await prisma.sesWarmupState.findUniqueOrThrow({ where: { storeId } });
  }
  if (warmup.pausedAt || (warmup.heldUntil && warmup.heldUntil > now)) {
    return { allowed: false, reason: "daily_cap", release: async () => undefined };
  }
  // One reputation policy governs both transports. Switching Resend ↔ SES may
  // change provider capacity, but it never resets the domain's reviewed ramp.
  policy.dailyCap = warmupDailyCap(warmup.healthyDay, Number.MAX_SAFE_INTEGER);
  if (selectedEmailProvider() === "ses") {
    policy.providerPerMinute = await sesProviderPerMinute();
    policy.providerWindowMs = 1_000;
    // SES's window is already one second, sized from its own quota.
    policy.providerPerSecond = Number.MAX_SAFE_INTEGER;
  }
  const token = randomUUID();
  const dateKey = now.toISOString().slice(0, 10);
  const minuteKey = Math.floor(now.getTime() / policy.providerWindowMs);
  const concurrencyKey = `joon:email:store:${storeId}:active`;
  const result = await client.eval(
    ACQUIRE_SCRIPT,
    4,
    `joon:email:store:${storeId}:daily:${dateKey}`,
    concurrencyKey,
    `joon:email:provider:minute:${minuteKey}`,
    `joon:email:provider:second:${Math.floor(now.getTime() / 1_000)}`,
    String(now.getTime()), token, String(policy.dailyCap), String(policy.storeConcurrency),
    String(policy.providerPerMinute), String(policy.leaseMs), String(DAY_MS * 2), String(policy.providerWindowMs * 2),
    String(policy.providerPerSecond),
  ) as string[];
  const reason = result[0];
  if (reason !== "allowed") {
    const at = now.getTime();
    const retryAfterMs =
      reason === "store_concurrency"
        // Ask again soon: a live send frees its lease in well under a second.
        // A crashed worker's leases run out on their own; don't wait that long
        // in one step, in case a live one frees first.
        ? Math.min(5_000, Math.max(250, Number(result[1] ?? at) - at))
        : reason === "provider_rate" && result[1] === "second"
          ? 1_000 - (at % 1_000) + jitter(250)
          : reason === "provider_rate"
            ? policy.providerWindowMs - (at % policy.providerWindowMs) + jitter(1_000)
            : undefined;
    return { allowed: false, reason: reason as EmailCapacityReason, retryAfterMs, release: async () => undefined };
  }
  let released = false;
  return {
    allowed: true,
    release: async () => {
      if (released) return;
      released = true;
      await client.zrem(concurrencyKey, token);
    },
  };
}

let quotaCache: { value: number; until: number } | undefined;
async function sesProviderPerMinute(): Promise<number> {
  if (quotaCache && quotaCache.until > Date.now()) return quotaCache.value;
  const perSecond = await new SesProvisioningService().maximumSendRate();
  const value = Math.max(1, Math.floor(perSecond * 0.9));
  quotaCache = { value, until: Date.now() + 5 * 60_000 };
  return value;
}

export async function closeEmailCapacityRedis(): Promise<void> {
  if (!redis) return;
  const client = redis;
  redis = undefined;
  await client.quit();
}
