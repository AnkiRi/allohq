import { UnrecoverableError } from "bullmq";

export function providerJobFailure(input: { error?: string; retryable?: boolean }): Error {
  const message = input.error || "Email provider delivery failed";
  return input.retryable ? new Error(message) : new UnrecoverableError(message);
}
