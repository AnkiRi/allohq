export type Check = { name: string; ok: boolean; detail: string };

export function configurationChecks(env: NodeJS.ProcessEnv): Check[] {
  const required = [
    "SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "DATABASE_URL", "REDIS_HOST",
    "DATA_ENCRYPTION_KEY", "UNSUBSCRIBE_SIGNING_SECRET", "WIDGET_VISITOR_SIGNING_SECRET",
    "API_BASE_URL", "ALLOWED_ORIGINS",
  ];
  const checks = required.map((name) => ({
    name: `environment:${name}`,
    ok: Boolean(env[name]?.trim()),
    detail: env[name]?.trim() ? "configured" : "missing",
  }));
  const mode = env.MESSAGING_SEND_MODE ?? "disabled";
  checks.push({ name: "email-only release boundary", ok: env.V1_RELEASE_MODE !== "false", detail: env.V1_RELEASE_MODE === "false" ? "disabled (unsafe for v1)" : "active/fail-closed" });
  checks.push({ name: "recognized delivery mode", ok: ["disabled", "allowlist", "live"].includes(mode), detail: mode });
  checks.push({ name: "provider credential", ok: mode === "disabled" || Boolean(env.RESEND_API_KEY?.trim()), detail: mode === "disabled" || env.RESEND_API_KEY?.trim() ? "safe" : "missing while delivery enabled" });
  checks.push({ name: "allowlist recipients", ok: mode !== "allowlist" || Boolean(env.MESSAGING_TEST_RECIPIENTS?.split(",").some((v) => v.trim())), detail: mode === "allowlist" ? "required in allowlist mode" : "not applicable" });
  checks.push({ name: "HTTPS unsubscribe origin", ok: env.NODE_ENV !== "production" || Boolean(env.API_BASE_URL?.startsWith("https://")), detail: env.API_BASE_URL ?? "missing" });
  return checks;
}

export function summarize(checks: Check[]) {
  return { passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}
