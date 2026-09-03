import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { redisConnection } from "../config";

export type EmailCapacityReason = "daily_cap" | "store_concurrency" | "provider_rate";

export interface EmailCapacityPolicy {
  dailyCap: number;
  storeConcurrency: number;
  providerPerMinute: number;
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

redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
if tonumber(redis.call('GET', KEYS[1]) or '0') >= dailyCap then return {'daily_cap'} end
if tonumber(redis.call('ZCARD', KEYS[2])) >= concurrencyCap then return {'store_concurrency'} end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= providerCap then return {'provider_rate'} end

redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[7]))
redis.call('ZADD', KEYS[2], now + leaseMs, token)
redis.call('PEXPIRE', KEYS[2], leaseMs * 2)
redis.call('INCR', KEYS[3])
redis.call('PEXPIRE', KEYS[3], tonumber(ARGV[8]))
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
  release(): Promise<void>;
}

export async function acquireEmailCapacity(storeId: string, installedAt: Date): Promise<EmailCapacityLease> {
  const client = capacityRedis();
  const now = new Date();
  const policy = emailCapacityPolicy(installedAt, now);
  const token = randomUUID();
  const dateKey = now.toISOString().slice(0, 10);
  const minuteKey = Math.floor(now.getTime() / 60_000);
  const concurrencyKey = `joon:email:store:${storeId}:active`;
  const result = await client.eval(
    ACQUIRE_SCRIPT,
    3,
    `joon:email:store:${storeId}:daily:${dateKey}`,
    concurrencyKey,
    `joon:email:provider:minute:${minuteKey}`,
    String(now.getTime()), token, String(policy.dailyCap), String(policy.storeConcurrency),
    String(policy.providerPerMinute), String(policy.leaseMs), String(DAY_MS * 2), "120000",
  ) as string[];
  const reason = result[0];
  if (reason !== "allowed") {
    return { allowed: false, reason: reason as EmailCapacityReason, release: async () => undefined };
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

export async function closeEmailCapacityRedis(): Promise<void> {
  if (!redis) return;
  const client = redis;
  redis = undefined;
  await client.quit();
}
