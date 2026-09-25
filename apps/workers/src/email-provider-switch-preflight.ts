/**
 * Operator check before moving new email traffic between Resend and SES.
 *
 *   pnpm --filter @allohq/workers exec tsx src/email-provider-switch-preflight.ts --to ses
 *
 * Reads the database named by DATABASE_URL and the environment it runs in.
 * Changes nothing and calls no provider. Exits 1 when the switch is blocked, so
 * it can gate a deploy script.
 */
import { emailProviderSwitchPreflight, type EmailProvider } from "./utils/email-provider-switch";

async function main() {
  const index = process.argv.indexOf("--to");
  const to = process.argv[index + 1];
  if (index === -1 || (to !== "ses" && to !== "resend")) {
    console.error("usage: email-provider-switch-preflight --to ses|resend");
    process.exit(2);
  }
  const from: EmailProvider = process.env["EMAIL_PROVIDER"] === "ses" ? "ses" : "resend";
  const report = await emailProviderSwitchPreflight({ from, to: to as EmailProvider });
  console.log(JSON.stringify(report, null, 2));
  console.log(
    report.safeToSwitchNewTraffic
      ? `\nSafe to move NEW traffic from ${from} to ${to}.`
      : `\nBlocked: ${report.blockers.length} issue(s) must be resolved before moving new traffic from ${from} to ${to}.`,
  );
  process.exit(report.safeToSwitchNewTraffic ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
