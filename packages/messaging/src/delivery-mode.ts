import type { Channel } from "./types";

export type MessagingSendMode = "disabled" | "allowlist" | "live";

export interface DeliveryModeDecision {
  allowed: boolean;
  mode: MessagingSendMode;
  reason?: "delivery_disabled" | "recipient_not_allowlisted" | "global_kill_switch";
}

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

export function assertEmailDeliveryConfigured(): void {
  const mode = getMessagingSendMode();
  if (mode === "disabled") return;
  if (!process.env["RESEND_API_KEY"]?.trim()) {
    throw new Error("RESEND_API_KEY must be configured when email delivery is enabled");
  }
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
