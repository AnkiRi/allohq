const EMAIL_ADDRESS = /[A-Z0-9._%+-][A-Z0-9._%+'-]*@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi;

/**
 * Provider error text can echo the recipient (SES names unverified addresses,
 * for example). That text is stored on MessageLog, kept as the job's failure
 * reason and printed to logs, none of which need the address: the row already
 * points at the customer. Everything else in the text, including markers such
 * as SES_AMBIGUOUS, is kept.
 */
export function redactEmailAddresses(text: string): string {
  return text.replace(EMAIL_ADDRESS, "[email]");
}
