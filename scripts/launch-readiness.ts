import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { configurationChecks, type Check, summarize } from "./launch-readiness-lib";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const shopifyConfigPath = fileURLToPath(
  new URL("../shopify.app.toml", import.meta.url),
);

async function endpointCheck(name: string, url: string, expectedText?: string): Promise<Check> {
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    const body = await response.text();
    return { name, ok: response.ok && (!expectedText || body.includes(expectedText)), detail: `HTTP ${response.status}` };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : "request failed" };
  }
}

async function main() {
  const checks = configurationChecks(process.env);
  if (!existsSync(shopifyConfigPath)) checks.push({ name: "linked Shopify config", ok: false, detail: `shopify.app.toml missing from ${repositoryRoot}; run Shopify config link` });
  else {
    const config = readFileSync(shopifyConfigPath, "utf8");
    checks.push({ name: "linked Shopify config", ok: !config.includes("REPLACE_WITH_"), detail: config.includes("REPLACE_WITH_") ? "contains placeholders" : "present" });
  }

  const web = process.env.WEB_APP_ORIGIN?.replace(/\/$/, "");
  const api = process.env.API_BASE_URL?.replace(/\/$/, "");
  if (web) {
    for (const path of ["/privacy", "/terms", "/dpa", "/subprocessors", "/support"]) {
      checks.push(await endpointCheck(`public route:${path}`, `${web}${path}`, "joon"));
    }
  } else checks.push({ name: "public trust routes", ok: false, detail: "WEB_APP_ORIGIN missing" });
  if (api) checks.push(await endpointCheck("API readiness", `${api}/healthz`, '"status":"ready"'));

  for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name} — ${check.detail}`);
  const result = summarize(checks);
  console.log(`\n${result.passed} passed, ${result.failed} failed`);
  if (result.failed) process.exitCode = 1;
}

void main();
