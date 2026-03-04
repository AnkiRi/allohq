import type { Message, SendResult } from "../../types";
import { sendViaProvider } from "../../provider";
import type { StoreMessagingConfig } from "../../provider";

export async function sendWhatsApp(
  message: Message,
  storeConfig?: StoreMessagingConfig | null
): Promise<SendResult> {
  return sendViaProvider("whatsapp", message, undefined, storeConfig);
}
