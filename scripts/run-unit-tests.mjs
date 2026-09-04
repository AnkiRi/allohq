import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const roots = [
  "apps/api/src",
  "apps/workers/src",
  "packages",
  "scripts",
];

function collectTests(relativeDirectory) {
  const directory = join(root, relativeDirectory);
  const tests = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = join(relativeDirectory, entry.name);
    if (entry.isDirectory()) tests.push(...collectTests(relative));
    else if (entry.isFile() && entry.name.endsWith(".test.ts")) tests.push(join(root, relative));
  }
  return tests;
}

const tests = roots.flatMap(collectTests).sort();
if (tests.length === 0) {
  console.error("No unit tests discovered");
  process.exit(1);
}

console.log(`Running ${tests.length} unit test files`);
const result = spawnSync(
  "pnpm",
  ["--filter", "@allohq/api", "exec", "tsx", "--test", ...tests],
  { cwd: root, env: process.env, stdio: "inherit" },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
