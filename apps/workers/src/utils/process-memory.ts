import { readFileSync } from "node:fs";
import { getHeapStatistics } from "node:v8";

/**
 * Where a process's resident memory actually is, not just how much there is.
 *
 * `process.memoryUsage().rss` is one number. The soak showed ~3.9 GB of it
 * outside the JS heap, which could be V8's committed-but-empty pages, glibc
 * malloc arenas holding freed memory, live native allocations, or mapped
 * files. On Linux, /proc/self/smaps says which mapping each resident page
 * belongs to, so they can be told apart.
 *
 * glibc gives each extra thread arena a 64 MiB-aligned, 64 MiB reservation
 * (HEAP_MAX_SIZE on 64-bit): a committed rw-p mapping followed by a PROT_NONE
 * remainder that together span exactly 64 MiB. The main arena is `[heap]`.
 * Everything else anonymous is V8's heap, direct mmaps and native libraries.
 */
export type MemoryBreakdown = {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  /** V8's own malloc use (outside the JS heap). */
  v8Malloced: number;
  threads: number | null;
  /** From smaps; null where /proc is unavailable (macOS). */
  mallocMainArena: number | null;
  mallocThreadArenas: number | null;
  threadArenaCount: number | null;
  otherAnonymous: number | null;
  fileBacked: number | null;
};

type Mapping = { start: bigint; end: bigint; perms: string; path: string; rss: number };

const ARENA_SPAN = 64n * 1024n * 1024n;

export function parseSmaps(text: string): Mapping[] {
  const mappings: Mapping[] = [];
  let current: Mapping | null = null;
  for (const line of text.split("\n")) {
    const header = /^([0-9a-f]+)-([0-9a-f]+) (\S{4}) \S+ \S+ \S+\s*(.*)$/.exec(line);
    if (header) {
      current = { start: BigInt(`0x${header[1]}`), end: BigInt(`0x${header[2]}`), perms: header[3]!, path: header[4]!.trim(), rss: 0 };
      mappings.push(current);
      continue;
    }
    const rss = /^Rss:\s+(\d+) kB/.exec(line);
    if (rss && current) current.rss = Number(rss[1]) * 1024;
  }
  return mappings;
}

export function classifySmaps(mappings: Mapping[]) {
  let mallocMainArena = 0;
  let mallocThreadArenas = 0;
  let threadArenaCount = 0;
  let otherAnonymous = 0;
  let fileBacked = 0;
  for (let i = 0; i < mappings.length; i += 1) {
    const mapping = mappings[i]!;
    if (mapping.path === "[heap]") { mallocMainArena += mapping.rss; continue; }
    if (mapping.path.startsWith("/")) { fileBacked += mapping.rss; continue; }
    if (mapping.path.startsWith("[")) { otherAnonymous += mapping.rss; continue; } // stacks, vdso
    const next = mappings[i + 1];
    const aligned = mapping.start % ARENA_SPAN === 0n;
    const span = next && next.start === mapping.end && next.perms === "---p" && next.path === ""
      ? next.end - mapping.start
      : mapping.end - mapping.start;
    if (mapping.perms === "rw-p" && aligned && span === ARENA_SPAN) {
      mallocThreadArenas += mapping.rss;
      threadArenaCount += 1;
    } else {
      otherAnonymous += mapping.rss;
    }
  }
  return { mallocMainArena, mallocThreadArenas, threadArenaCount, otherAnonymous, fileBacked };
}

export function processMemory(): MemoryBreakdown {
  const usage = process.memoryUsage();
  const base = {
    rss: usage.rss, heapUsed: usage.heapUsed, heapTotal: usage.heapTotal, external: usage.external,
    arrayBuffers: usage.arrayBuffers, v8Malloced: getHeapStatistics().malloced_memory,
  };
  try {
    const status = readFileSync("/proc/self/status", "utf8");
    const threads = Number(/^Threads:\s+(\d+)/m.exec(status)?.[1] ?? NaN);
    return { ...base, threads: Number.isFinite(threads) ? threads : null, ...classifySmaps(parseSmaps(readFileSync("/proc/self/smaps", "utf8"))) };
  } catch {
    return { ...base, threads: null, mallocMainArena: null, mallocThreadArenas: null, threadArenaCount: null, otherAnonymous: null, fileBacked: null };
  }
}
