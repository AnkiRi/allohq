/**
 * Test script for messaging providers.
 *
 * Usage:
 *   pnpm tsx scripts/test-messaging.ts [channel] [provider]
 *
 * Examples:
 *   pnpm tsx scripts/test-messaging.ts sms twilio
 *   pnpm tsx scripts/test-messaging.ts whatsapp gupshup
 *   pnpm tsx scripts/test-messaging.ts whatsapp twilio
 *   pnpm tsx scripts/test-messaging.ts rcs twilio
 *   pnpm tsx scripts/test-messaging.ts all          # test all channels with default providers
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load workers env (has all credentials)
config({ path: resolve(__dirname, "../apps/workers/.env") });

import { sendSms, sendWhatsApp, sendRcs, sendViaProvider } from "@allohq/messaging";
import type { Provider, MessagingChannel } from "@allohq/messaging";

const TEST_PHONE = "+919632825508";

async function testChannel(channel: MessagingChannel, provider?: Provider) {
  console.log(`\n--- Testing ${channel.toUpperCase()} ${provider ? `via ${provider}` : "(default provider)"} ---`);

  const timestamp = new Date().toLocaleTimeString();

  try {
    let result;

    if (provider) {
      // Use sendViaProvider to force a specific provider
      result = await sendViaProvider(channel, {
        channel,
        to: TEST_PHONE,
        body: `AlloHQ test ${channel} via ${provider} at ${timestamp}`,
        ...(channel === "rcs" ? { cardTitle: "AlloHQ Test" } : {}),
      }, provider);
    } else {
      // Use the channel function (respects env/store config)
      switch (channel) {
        case "sms":
          result = await sendSms({ channel: "sms", to: TEST_PHONE, body: `AlloHQ test SMS at ${timestamp}` });
          break;
        case "whatsapp":
          result = await sendWhatsApp({ channel: "whatsapp", to: TEST_PHONE, body: `AlloHQ test WhatsApp at ${timestamp}` });
          break;
        case "rcs":
          result = await sendRcs({ channel: "rcs", to: TEST_PHONE, body: `AlloHQ test RCS at ${timestamp}`, cardTitle: "AlloHQ Test" });
          break;
      }
    }

    if (result.status === "sent") {
      console.log(`  ✅ SENT`);
      console.log(`  Provider: ${result.provider}`);
      console.log(`  External ID: ${result.externalId}`);
      console.log(`  Message ID: ${result.messageId}`);
    } else {
      console.log(`  ❌ FAILED`);
      console.log(`  Provider: ${result.provider}`);
      console.log(`  Error: ${result.error}`);
    }

    return result;
  } catch (err) {
    console.log(`  💥 EXCEPTION: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function main() {
  const [channelArg, providerArg] = process.argv.slice(2);

  console.log("=== AlloHQ Messaging Test ===");
  console.log(`Target: ${TEST_PHONE}`);
  console.log(`Env SMS provider: ${process.env.MESSAGING_SMS_PROVIDER ?? "(default=twilio)"}`);
  console.log(`Env WhatsApp provider: ${process.env.MESSAGING_WHATSAPP_PROVIDER ?? "(default=twilio)"}`);
  console.log(`Env RCS provider: ${process.env.MESSAGING_RCS_PROVIDER ?? "(default=twilio)"}`);

  if (channelArg === "all" || !channelArg) {
    // Test all channels with their default providers
    await testChannel("sms");
    await testChannel("whatsapp");
    await testChannel("rcs");
  } else {
    const channel = channelArg as MessagingChannel;
    const provider = providerArg as Provider | undefined;
    await testChannel(channel, provider);
  }

  console.log("\n=== Done ===");
}

main();
