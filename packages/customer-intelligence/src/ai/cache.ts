import { createHash } from "node:crypto";
import type { ProviderResult } from "./providers";

// ---------------------------------------------------------------------------
// Response cache: a content-hash keyed (model + prompt + params) → response
// store. In-memory LRU with TTL — no external dependency required. Deterministic
// calls (low temperature, e.g. classification/analysis) are cached; creative /
// high-temperature calls are skipped so we never serve a stale "creative" reply.
// ---------------------------------------------------------------------------

/** Below this temperature a call is considered deterministic and cacheable. */
const CACHE_TEMPERATURE_THRESHOLD = 0.3;
const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h

export interface CacheKeyParts {
  model: string;
  prompt: string;
  system?: string;
  temperature: number;
  maxTokens: number;
  jsonMode: boolean;
}

interface CacheEntry {
  value: ProviderResult;
  expiresAt: number;
}

class LruResponseCache {
  private store = new Map<string, CacheEntry>();

  constructor(
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
    private readonly ttlMs = DEFAULT_TTL_MS,
  ) {}

  static keyFor(parts: CacheKeyParts): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          m: parts.model,
          p: parts.prompt,
          s: parts.system ?? "",
          t: parts.temperature,
          mt: parts.maxTokens,
          j: parts.jsonMode,
        }),
      )
      .digest("hex");
  }

  get(key: string): ProviderResult | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh recency (Map preserves insertion order → re-insert = most recent).
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: ProviderResult): void {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    // Evict least-recently-used (oldest insertion) entries past capacity.
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }
}

const responseCache = new LruResponseCache();

/**
 * Whether a call is eligible for caching. Skip creative/high-temperature work;
 * cache only deterministic completions.
 */
export function isCacheable(parts: CacheKeyParts): boolean {
  return parts.temperature <= CACHE_TEMPERATURE_THRESHOLD;
}

export function cacheGet(parts: CacheKeyParts): ProviderResult | undefined {
  if (!isCacheable(parts)) return undefined;
  return responseCache.get(LruResponseCache.keyFor(parts));
}

export function cacheSet(parts: CacheKeyParts, value: ProviderResult): void {
  if (!isCacheable(parts)) return;
  responseCache.set(LruResponseCache.keyFor(parts), value);
}
