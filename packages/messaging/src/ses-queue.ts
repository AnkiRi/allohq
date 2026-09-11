import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { parseSnsWrappedSesEvent, type NormalizedSesEvent } from "./ses-events";

export async function pollSesEventQueue(input: { queueUrl: string; onEvent: (event: NormalizedSesEvent, raw: string) => Promise<void>; onPoison?: (error: unknown, raw: string) => Promise<void> | void; client?: SQSClient; abortSignal?: AbortSignal }): Promise<number> {
  const client = input.client ?? new SQSClient({ region: process.env["AWS_SES_REGION"] || "ap-south-1" });
  const result = await client.send(new ReceiveMessageCommand({ QueueUrl: input.queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: 20, VisibilityTimeout: 60 }), { abortSignal: input.abortSignal });
  let handled = 0;
  for (const message of result.Messages || []) {
    if (!message.Body || !message.ReceiptHandle) continue;
    try {
      const event = parseSnsWrappedSesEvent(message.Body);
      await input.onEvent(event, message.Body);
      await client.send(new DeleteMessageCommand({ QueueUrl: input.queueUrl, ReceiptHandle: message.ReceiptHandle }));
      handled += 1;
    } catch (error) {
      // Do not acknowledge poison or transiently-failed messages. The queue's
      // redrive policy moves them to its DLQ after the configured receive count.
      await input.onPoison?.(error, message.Body);
    }
  }
  return handled;
}
