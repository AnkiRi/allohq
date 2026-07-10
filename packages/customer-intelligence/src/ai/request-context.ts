import { AsyncLocalStorage } from "node:async_hooks";

// Per-request LLM context, carried ambiently so provider key selection can differ
// for the public demo WITHOUT threading a flag through every generate/chat call.
// The API sets `{ demo: true }` around demo-guest requests (see trpc.ts); providers
// then use the DEMO_* keys (falling back to prod keys if those aren't configured),
// so demo traffic can be pointed at a separate LLM org/quota and never spends
// against prod's limits.
export interface LlmRequestContext {
  demo: boolean;
}

export const llmRequestContext = new AsyncLocalStorage<LlmRequestContext>();

/** True when the current request is running as the public demo. */
export function isDemoLlmRequest(): boolean {
  return llmRequestContext.getStore()?.demo === true;
}
