/**
 * Who reaches the dashboard, and who is sent to sign in.
 *
 * Its own module, with no imports: `RequireSession` pulls in Clerk and the Next
 * router, and a test of this decision should not have to load either to find
 * out what it does.
 */
export type SessionDecision = "wait" | "redirect" | "render";

/**
 * The whole decision, as a function, so it can be checked without standing up
 * Clerk and App Bridge.
 *
 * - An embedded Shopify session renders regardless of Clerk. Its credential is
 *   an App Bridge token, and redirecting it would break the install the
 *   middleware exemption exists to protect.
 * - Until Clerk has loaded, wait. Redirecting on an unsettled state would sign
 *   people out of their own session.
 * - No session, and not embedded: sign in.
 */
export function sessionDecision(input: {
  isLoaded: boolean;
  isSignedIn: boolean;
  embedded: boolean;
}): SessionDecision {
  if (input.embedded) return "render";
  if (!input.isLoaded) return "wait";
  return input.isSignedIn ? "render" : "redirect";
}
