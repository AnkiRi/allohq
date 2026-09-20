import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertDisposableDatabaseUrl } from "./assert-disposable-database.mjs";

/**
 * Integration tests: every `*.integration.ts` in the workspace.
 *
 * These require real Postgres and, for some suites, real Redis. They are kept
 * out of `pnpm test` so the unit suite stays infrastructure-free, and CI runs
 * them against disposable service containers.
 *
 * TEST_DATABASE_URL must point at an isolated, disposable database. Never point
 * it at a production database: these suites create workspaces, stores, hundreds
 * of thousands of customers and audience rows.
 */
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const roots = ["apps/api/src", "apps/widget/src", "apps/workers/src", "packages"];

function collect(relativeDirectory) {
  const directory = join(root, relativeDirectory);
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const relative = join(relativeDirectory, entry.name);
    if (entry.isDirectory()) found.push(...collect(relative));
    else if (entry.isFile() && entry.name.endsWith(".integration.ts")) {
      found.push(join(root, relative));
    }
  }
  return found;
}

assertDisposableDatabaseUrl(process.env.TEST_DATABASE_URL);

const tests = roots.flatMap(collect).sort();
if (tests.length === 0) {
  console.error("No integration tests discovered");
  process.exit(1);
}

// The load proof seeds 125,000 customers; it is opt-in rather than part of the
// default integration run.
const selected = process.env.RUN_LOAD_TESTS
  ? tests
  : tests.filter((file) => !file.endsWith(".load.integration.ts"));

console.log(`Running ${selected.length} integration test files`);
const result = spawnSync(
  "pnpm",
  ["--filter", "@allohq/api", "exec", "tsx", "--test", ...selected],
  { cwd: root, env: process.env, stdio: "inherit" },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
