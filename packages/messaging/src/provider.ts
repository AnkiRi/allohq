import type {
  Message,
  MessagingChannel,
  Provider,
  ProviderSendFn,
  SendResult,
} from "./types";
import { getDeliveryModeDecision } from "./delivery-mode";
import { isChannelAllowed } from "@allohq/release-gate";
import { randomUUID } from "node:crypto";

// ── Store config type (matches Prisma's messagingConfig JSON) ───────────────

export interface StoreMessagingConfig {
  smsProvider?: Provider;
  whatsappProvider?: Provider;
  rcsProvider?: Provider;
}

// ── Provider resolution ─────────────────────────────────────────────────────

export function getProvider(
  channel: MessagingChannel,
  override?: Provider,
  storeConfig?: StoreMessagingConfig | null
): Provider {
  if (override) return override;

  // Per-store config takes priority over env vars
  if (storeConfig) {
    const storeProvider = storeConfig[`${channel}Provider` as keyof StoreMessagingConfig];
    if (storeProvider) return storeProvider;
  }

  const envVal =
    process.env[`MESSAGING_${channel.toUpperCase()}_PROVIDER`];
  return envVal === "gupshup" ? "gupshup" : "twilio";
}

// ── Cached send functions ───────────────────────────────────────────────────

const fnCache = new Map<string, ProviderSendFn>();

async function resolveSendFn(
  provider: Provider,
  channel: MessagingChannel
): Promise<ProviderSendFn> {
  const key = `${provider}:${channel}`;
  const cached = fnCache.get(key);
  if (cached) return cached;

  let fn: ProviderSendFn;

  if (provider === "twilio") {
    switch (channel) {
      case "sms": {
        const mod = await import("./providers/twilio/sms");
        fn = mod.sendSmsTwilio;
        break;
      }
      case "whatsapp": {
        const mod = await import("./providers/twilio/whatsapp");
        fn = mod.sendWhatsAppTwilio;
        break;
      }
      case "rcs": {
        const mod = await import("./providers/twilio/rcs");
        fn = mod.sendRcsTwilio;
        break;
      }
    }
  } else {
    switch (channel) {
      case "sms": {
        const mod = await import("./providers/gupshup/sms");
        fn = mod.sendSmsGupshup;
        break;
      }
      case "whatsapp": {
        const mod = await import("./providers/gupshup/whatsapp");
        fn = mod.sendWhatsAppGupshup;
        break;
      }
      case "rcs": {
        const mod = await import("./providers/gupshup/rcs");
        fn = mod.sendRcsGupshup;
        break;
      }
    }
  }

  fnCache.set(key, fn);
  return fn;
}

// ── Dispatch ────────────────────────────────────────────────────────────────

export async function sendViaProvider(
  channel: MessagingChannel,
  message: Message,
  providerOverride?: Provider,
  storeConfig?: StoreMessagingConfig | null
): Promise<SendResult> {
  // v1 release boundary: email is the only channel in scope. Checked before
  // the provider is touched so an out-of-scope channel can never reach a
  // provider, even if a caller bypasses the unified send() dispatcher.
  if (!isChannelAllowed(channel)) {
    return {
      messageId: randomUUID(),
      channel,
      status: "failed",
      error: `Blocked by the v1 release boundary: ${channel} is not in scope`,
    };
  }

  const provider = getProvider(channel, providerOverride, storeConfig);
  const delivery = getDeliveryModeDecision(message.to, channel);
  if (!delivery.allowed) {
    return {
      messageId: randomUUID(),
      channel,
      status: "failed",
      error: `Messaging ${delivery.reason} (mode: ${delivery.mode})`,
      provider,
    };
  }
  const sendFn = await resolveSendFn(provider, channel);
  return sendFn(message);
}
