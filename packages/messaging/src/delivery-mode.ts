import type { Channel } from "./types";

export type MessagingSendMode = "disabled" | "allowlist" | "live";

export interface DeliveryModeDecision {
  allowed: boolean;
  mode: MessagingSendMode;
  reason?: "delivery_disabled" | "recipient_not_allowlisted" | "global_kill_switch";
}

export type EmailDeliveryClass = "marketing" | "transactional";

function normalizedRecipient(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed;
  return trimmed.replace(/[^\d+]/g, "");
}

export function getMessagingSendMode(
  value = process.env["MESSAGING_SEND_MODE"],
): MessagingSendMode {
  return value === "live" || value === "allowlist" ? value : "disabled";
}

/**
 * Everything a provider needs before it may carry email, as a list of
 * problems rather than a first-failure throw.
 *
 * Parameterised by provider so a switch can be checked BEFORE it happens: the
 * startup check below only ever sees the provider already selected, which is
 * too late to learn that the other one is not ready.
 */
export function emailProviderConfigProblems(
  provider: "resend" | "ses",
  env: Record<string, string | undefined> = process.env,
): string[] {
  const problems: string[] = [];
  if (provider === "ses") {
    const region = env["AWS_SES_REGION"]?.trim();
    const account = env["AWS_ACCOUNT_ID"]?.trim();
    const topic = env["SES_EVENT_TOPIC_ARN"]?.trim();
    if (!region) problems.push("AWS_SES_REGION must be configured when SES delivery is enabled");
    if (env["SES_TENANT_REGION_CONFIRMED"] !== "true") problems.push("SES_TENANT_REGION_CONFIRMED=true is required before SES delivery is enabled");
    if (!/^\d{12}$/.test(account ?? "")) problems.push("AWS_ACCOUNT_ID must be a 12-digit account id");
    if (!env["SES_FROM_EMAIL"]?.trim()) problems.push("SES_FROM_EMAIL must be configured when SES delivery is enabled");
    if (!env["SES_EVENT_QUEUE_URL"]?.trim()) problems.push("SES_EVENT_QUEUE_URL must be configured when SES delivery is enabled");
    if (!env["SES_STANDARD_REPUTATION_POLICY"]?.trim()) problems.push("SES_STANDARD_REPUTATION_POLICY must be configured when SES delivery is enabled");
    if (!topic?.startsWith(`arn:aws:sns:${region}:${account}:`)) problems.push("SES_EVENT_TOPIC_ARN must match the configured region and account");
  }
  if (provider === "resend" && !env["RESEND_API_KEY"]?.trim()) {
    problems.push("RESEND_API_KEY must be configured when email delivery is enabled");
  }
  return problems;
}

export function assertEmailDeliveryConfigured(): void {
  const mode = getMessagingSendMode();
  if (mode === "disabled") return;
  const provider = process.env["EMAIL_PROVIDER"] === "ses" ? "ses" : "resend";
  const [first] = emailProviderConfigProblems(provider);
  if (first) throw new Error(first);
  if (
    mode === "allowlist" &&
    !(process.env["MESSAGING_TEST_RECIPIENTS"] ?? "").split(",").some((value) => value.trim())
  ) {
    throw new Error("MESSAGING_TEST_RECIPIENTS must not be empty in allowlist mode");
  }
}

/**
 * Global last-mile safety gate.
 *
 * The default is deliberately disabled: production delivery requires an
 * explicit operational choice, not the accidental presence of provider keys.
 * In allowlist mode messages are never redirected, because redirecting a
 * customer's personalized content to a tester could leak private data.
 */
export function getDeliveryModeDecision(
  recipient: string,
  _channel: Channel,
  env: {
    mode?: string;
    allowlist?: string;
    killSwitch?: string;
  } = {},
): DeliveryModeDecision {
  const mode = getMessagingSendMode(
    env.mode ?? process.env["MESSAGING_SEND_MODE"],
  );
  const killSwitch = env.killSwitch ?? process.env["GLOBAL_EMAIL_KILL_SWITCH"];
  if (_channel === "email" && killSwitch?.trim().toLowerCase() === "true") {
    return { allowed: false, mode, reason: "global_kill_switch" };
  }
  if (mode === "disabled") {
    return { allowed: false, mode, reason: "delivery_disabled" };
  }
  if (mode === "live") return { allowed: true, mode };

  const allowlist = new Set(
    (env.allowlist ?? process.env["MESSAGING_TEST_RECIPIENTS"] ?? "")
      .split(",")
      .map(normalizedRecipient)
      .filter(Boolean),
  );
  if (!allowlist.has(normalizedRecipient(recipient))) {
    return { allowed: false, mode, reason: "recipient_not_allowlisted" };
  }
  return { allowed: true, mode };
}

/**
 * Consent and account-lifecycle messages use a transactional lane: they do
 * not inherit campaign allowlists, complaint pauses, or the marketing kill
 * switch. A separate emergency switch remains available for provider or
 * abuse incidents. Recipient-level hard-bounce suppression is enforced by
 * the caller before this policy is evaluated.
 */
export function getEmailDeliveryDecision(
  recipient: string,
  deliveryClass: EmailDeliveryClass,
  env: {
    mode?: string;
    allowlist?: string;
    killSwitch?: string;
    transactionalKillSwitch?: string;
  } = {},
): DeliveryModeDecision {
  if (deliveryClass === "marketing") {
    return getDeliveryModeDecision(recipient, "email", env);
  }
  const stopped =
    env.transactionalKillSwitch ??
    process.env["TRANSACTIONAL_EMAIL_KILL_SWITCH"];
  if (stopped?.trim().toLowerCase() === "true") {
    return {
      allowed: false,
      mode: getMessagingSendMode(env.mode),
      reason: "global_kill_switch",
    };
  }
  return { allowed: true, mode: getMessagingSendMode(env.mode) };
}
