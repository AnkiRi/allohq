import type { Message, SendResult } from "../../types";
import { sendViaProvider } from "../../provider";
import type { StoreMessagingConfig } from "../../provider";

export async function sendSms(
  message: Message,
  storeConfig?: StoreMessagingConfig | null
): Promise<SendResult> {
  return sendViaProvider("sms", message, undefined, storeConfig);
}
