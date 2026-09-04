import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.env.INIT_CWD ?? process.cwd(), process.env.INIT_CWD ? "." : "../..");
const sourceRoots = ["apps/api/src", "apps/workers/src"];

function sourceFiles(relativeDirectory: string): string[] {
  const directory = join(root, relativeDirectory);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [relative]
      : [];
  });
}

test("production logs do not interpolate direct customer contact fields", () => {
  const violations: string[] = [];
  for (const relative of sourceRoots.flatMap(sourceFiles)) {
    const lines = readFileSync(join(root, relative), "utf8").split("\n");
    lines.forEach((line, index) => {
      if (
        /console\.(?:log|info|warn|error)/.test(line) &&
        /\$\{(?:customer\.(?:email|phone)|(?:email|phone|from|source))\}/.test(line)
      ) {
        violations.push(`${relative}:${index + 1}`);
      }
    });
  }

  assert.deepEqual(
    violations,
    [],
    `Direct customer contact data must not appear in production logs:\n${violations.join("\n")}`,
  );
});
