import { sendSms, sendWhatsApp } from "@allohq/messaging";
import { addMemory } from "@allohq/agent-brain";
import type { ToolDefinition } from "../types";

export const messagingTools: ToolDefinition[] = [
  {
    name: "send_followup",
    description:
      "Send a follow-up message to the customer via SMS or WhatsApp. Use for sending discount codes, order updates, or re-engagement messages.",
    parameters: {
      channel: {
        type: "string",
        enum: ["sms", "whatsapp"],
        description: "Channel to send on",
      },
      phone: { type: "string", description: "Customer phone number" },
      message: { type: "string", description: "Message body" },
    },
    handler: async (params, ctx) => {
      const channel = String(params.channel);
      const phone = String(params.phone);
      const body = String(params.message);

      let result;
      if (channel === "whatsapp") {
        result = await sendWhatsApp({ channel: "whatsapp", to: phone, body });
      } else {
        result = await sendSms({ channel: "sms", to: phone, body });
      }

      // Log this as a memory if we have a customer
      if (ctx.customerId && result.status === "sent") {
        await addMemory(
          ctx.storeId,
          ctx.customerId,
          "interaction_note",
          `Agent sent ${channel} message: "${body.substring(0, 100)}..."`,
          "agent"
        );
      }

      return {
        sent: result.status === "sent",
        channel,
        provider: result.provider,
        error: result.status === "failed" ? result.error : undefined,
      };
    },
  },
];
