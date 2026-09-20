/**
 * Refuse to run destructive test suites against anything that might be real.
 *
 * Integration suites create workspaces, stores, hundreds of thousands of
 * customers and audience rows, and delete them again. Pointing one at a
 * production database would be unrecoverable, so the check is a allowlist, not
 * a blocklist: a URL must positively look disposable or it is rejected.
 */

/** Hosts a disposable database may live on. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"]);

/** A database name must say it is disposable. */
const DISPOSABLE_NAME = /(^|[_-])(test|tests|testing|ci|integration|disposable|scratch|tmp|temp)([_-]|$)/i;

/** Managed-database hostnames that must never be a test target, even by accident. */
const MANAGED_HOST = /(rds\.amazonaws\.com|neon\.tech|supabase\.co|render\.com|railway\.app|planetscale|azure\.com|digitalocean\.com|gcp|cloudsql)/i;

export function checkDisposableDatabaseUrl(rawUrl) {
  if (!rawUrl) return { ok: false, reason: "no database URL was provided" };

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "the database URL could not be parsed" };
  }

  const host = url.hostname.toLowerCase();
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));

  if (MANAGED_HOST.test(host)) {
    return { ok: false, reason: `"${host}" is a managed database host` };
  }
  // A CI service container is reachable on a service name rather than
  // localhost, so an explicit opt-in covers that case and nothing else.
  const allowRemote = process.env.ALLOW_NON_LOCAL_TEST_DATABASE === "1";
  if (!LOCAL_HOSTS.has(host) && !allowRemote) {
    return {
      ok: false,
      reason: `"${host}" is not a local host (set ALLOW_NON_LOCAL_TEST_DATABASE=1 only for a disposable CI service container)`,
    };
  }
  if (!DISPOSABLE_NAME.test(name)) {
    return {
      ok: false,
      reason: `database "${name}" is not named as disposable; its name must contain test, ci, integration, disposable, scratch or tmp`,
    };
  }
  return { ok: true, host, name };
}

/** Exits the process with an explanation when the URL is not disposable. */
export function assertDisposableDatabaseUrl(rawUrl, label = "TEST_DATABASE_URL") {
  const result = checkDisposableDatabaseUrl(rawUrl);
  if (result.ok) return result;
  console.error(
    `\nRefusing to run: ${label} ${result.reason}.\n` +
      `These suites create and delete data. Point ${label} at an isolated,\n` +
      `disposable database - never production.\n`
  );
  process.exit(1);
}
