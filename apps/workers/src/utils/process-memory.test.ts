import assert from "node:assert/strict";
import test from "node:test";
import { classifySmaps, parseSmaps, processMemory } from "./process-memory";

const kb = (n: number) => `Rss:                ${n} kB`;
// A trimmed /proc/self/smaps: a binary, the main arena, one glibc thread arena
// (committed part + PROT_NONE remainder spanning exactly 64 MiB, aligned), a
// plain anonymous region (e.g. V8 pages), and a thread stack.
const SMAPS = [
  "55d0c0000000-55d0c0200000 r-xp 00000000 08:01 1234  /usr/bin/node",
  kb(1500),
  "55d0c1000000-55d0c9000000 rw-p 00000000 00:00 0  [heap]",
  kb(20000),
  "7f0004000000-7f0006000000 rw-p 00000000 00:00 0 ",
  kb(30000),
  "AnonHugePages:      4096 kB",
  "7f0006000000-7f0008000000 ---p 00000000 00:00 0 ",
  kb(0),
  "7f1000000000-7f1000100000 rw-p 00000000 00:00 0 ",
  kb(900),
  "7ffc00000000-7ffc00021000 rw-p 00000000 00:00 0  [stack]",
  kb(100),
].join("\n");

test("smaps pages are attributed to the main arena, thread arenas, other anonymous memory and files", () => {
  const result = classifySmaps(parseSmaps(SMAPS));
  assert.equal(result.fileBacked, 1500 * 1024);
  assert.equal(result.mallocMainArena, 20000 * 1024);
  assert.equal(result.mallocThreadArenas, 30000 * 1024);
  assert.equal(result.threadArenaCount, 1);
  assert.equal(result.otherAnonymous, (900 + 100) * 1024);
  assert.equal(result.anonHugePages, 4096 * 1024);
});

test("an anonymous mapping that is not a 64 MiB-aligned arena is not called one", () => {
  const misaligned = SMAPS.replace("7f0004000000-7f0006000000", "7f0004100000-7f0006000000");
  const result = classifySmaps(parseSmaps(misaligned));
  assert.equal(result.threadArenaCount, 0);
  assert.equal(result.mallocThreadArenas, 0);
});

test("the live breakdown always carries the JS heap figures, and smaps only where /proc exists", () => {
  const memory = processMemory();
  assert.ok(memory.rss > 0 && memory.heapTotal >= memory.heapUsed);
  if (process.platform === "linux") assert.ok((memory.otherAnonymous ?? 0) > 0);
  else assert.equal(memory.mallocMainArena, null);
});
