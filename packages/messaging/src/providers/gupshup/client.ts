// Gupshup uses different auth for SMS vs WhatsApp/RCS.
// No SDK — all via native fetch.

export function getGupshupSmsConfig() {
  const userid = process.env.GUPSHUP_SMS_USERID;
  const password = process.env.GUPSHUP_SMS_PASSWORD;
  if (!userid || !password) {
    throw new Error(
      "GUPSHUP_SMS_USERID and GUPSHUP_SMS_PASSWORD environment variables must be set"
    );
  }
  return { userid, password };
}

export function getGupshupAppConfig() {
  const apiKey = process.env.GUPSHUP_API_KEY;
  const appName = process.env.GUPSHUP_APP_NAME;
  if (!apiKey || !appName) {
    throw new Error(
      "GUPSHUP_API_KEY and GUPSHUP_APP_NAME environment variables must be set"
    );
  }
  return { apiKey, appName };
}
