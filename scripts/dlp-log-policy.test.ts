import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.env.INIT_CWD ?? process.cwd(), process.env.INIT_CWD ? "." : "../..");
const sourceRoots = [
  "apps/api/src",
  "apps/workers/src",
  ...readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, "packages", entry.name, "src")))
    .map((entry) => `packages/${entry.name}/src`),
];

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

// Error messages count as logs: they become a job's failure reason, which the
// dead-letter capture prints and BullMQ keeps.
const LOG_OR_THROW = /console\.(?:log|info|warn|error)|throw new [A-Za-z]*Error\(/;
const CONTACT_FIELD = /^(?:[\w$]+(?:\?\.|\.))*(?:email|phone|from|source|to|recipient|emailAddress|email_address|phoneNumber)$/;

/** True when an interpolation's value can be a contact field, e.g. `${a ?? customer.email}`. */
function interpolatesContactField(line: string): boolean {
  return [...line.matchAll(/\$\{([^}]*)\}/g)].some(([, expression]) =>
    expression!.split(/\?\?|\|\|/).some((operand) => CONTACT_FIELD.test(operand.trim())),
  );
}

test("the contact-field rule catches values, not mentions", () => {
  assert.equal(interpolatesContactField("throw new Error(`before customer ${externalId ?? email ?? \"unknown\"}`)"), true);
  assert.equal(interpolatesContactField("console.log(`to ${customer.email}`)"), true);
  assert.equal(interpolatesContactField("console.log(`to ${message?.to}`)"), true);
  assert.equal(interpolatesContactField("throw new Error(`before customer ${externalId ?? (email ? \"(matched by email)\" : \"unknown\")}`)"), false);
  assert.equal(interpolatesContactField("console.log(`unreachable (${source.status})`)"), false);
  assert.equal(interpolatesContactField("console.log(`suppressed ${customer.id}: ${emailGovCheck.reason}`)"), false);
});

test("production logs and thrown errors do not interpolate direct customer contact fields", () => {
  const violations: string[] = [];
  for (const relative of sourceRoots.flatMap(sourceFiles)) {
    const lines = readFileSync(join(root, relative), "utf8").split("\n");
    lines.forEach((line, index) => {
      if (LOG_OR_THROW.test(line) && interpolatesContactField(line)) {
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
